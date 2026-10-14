<?php
// API do Cifra Viva: conta e sincronização dos seus dados (cifras, favoritas, progresso).
// Precisa de api/config.php (copie de config.sample.php e preencha com os dados do MySQL).
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(int $code, string $msg): void
{
    out(['error' => $msg], $code);
}

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) {
    fail(503, 'API não configurada: crie api/config.php');
}
$cfg = require $cfgFile;

try {
    $pdo = new PDO(
        "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4",
        $cfg['db_user'],
        $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fail(500, 'Não consegui conectar ao banco de dados. Confira o api/config.php.');
}

// cria as tabelas na primeira vez
$pdo->exec('CREATE TABLE IF NOT EXISTS cv_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    pass_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
$pdo->exec('CREATE TABLE IF NOT EXISTS cv_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
$pdo->exec('CREATE TABLE IF NOT EXISTS cv_data (
    user_id INT PRIMARY KEY,
    data LONGTEXT NOT NULL,
    updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
$pdo->exec('CREATE TABLE IF NOT EXISTS cv_attempts (
    ip VARCHAR(45) NOT NULL,
    at DATETIME NOT NULL,
    INDEX (ip, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

$action = $_GET['a'] ?? '';
$body = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, 6 * 1024 * 1024);
    $body = json_decode($raw ?: '[]', true) ?: [];
}
$ip = $_SERVER['REMOTE_ADDR'] ?? '';

function tooManyAttempts(PDO $pdo, string $ip): bool
{
    $q = $pdo->prepare('SELECT COUNT(*) FROM cv_attempts WHERE ip = ? AND at > (NOW() - INTERVAL 15 MINUTE)');
    $q->execute([$ip]);
    return (int) $q->fetchColumn() >= 10;
}
function recordAttempt(PDO $pdo, string $ip): void
{
    $pdo->prepare('INSERT INTO cv_attempts (ip, at) VALUES (?, NOW())')->execute([$ip]);
    $pdo->exec('DELETE FROM cv_attempts WHERE at < (NOW() - INTERVAL 1 DAY)');
}
function newToken(PDO $pdo, int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO cv_tokens (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL 180 DAY)')
        ->execute([hash('sha256', $token), $userId]);
    return $token;
}
function currentUser(PDO $pdo): array
{
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        fail(401, 'Entre na sua conta.');
    }
    $q = $pdo->prepare('SELECT u.id, u.email FROM cv_tokens t JOIN cv_users u ON u.id = t.user_id
                        WHERE t.token_hash = ? AND t.expires_at > NOW()');
    $q->execute([hash('sha256', $token)]);
    $user = $q->fetch();
    if (!$user) {
        fail(401, 'Sessão expirada. Entre de novo.');
    }
    return $user;
}

switch ($action) {
    case 'ping':
        out(['ok' => true, 'registration' => (bool) ($cfg['allow_register'] ?? false)]);

    case 'register':
        if (empty($cfg['allow_register'])) {
            fail(403, 'Novos cadastros estão desligados.');
        }
        if (tooManyAttempts($pdo, $ip)) {
            fail(429, 'Muitas tentativas. Espere 15 minutos.');
        }
        recordAttempt($pdo, $ip);
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $pass = (string) ($body['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 8) {
            fail(400, 'Use um e-mail válido e uma senha com pelo menos 8 caracteres.');
        }
        try {
            $pdo->prepare('INSERT INTO cv_users (email, pass_hash) VALUES (?, ?)')
                ->execute([$email, password_hash($pass, PASSWORD_DEFAULT)]);
        } catch (PDOException $e) {
            fail(409, 'Esse e-mail já tem conta. Use Entrar.');
        }
        $id = (int) $pdo->lastInsertId();
        out(['token' => newToken($pdo, $id), 'email' => $email]);

    case 'login':
        if (tooManyAttempts($pdo, $ip)) {
            fail(429, 'Muitas tentativas. Espere 15 minutos.');
        }
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $q = $pdo->prepare('SELECT id, pass_hash FROM cv_users WHERE email = ?');
        $q->execute([$email]);
        $user = $q->fetch();
        if (!$user || !password_verify((string) ($body['password'] ?? ''), $user['pass_hash'])) {
            recordAttempt($pdo, $ip);
            fail(401, 'E-mail ou senha incorretos.');
        }
        $pdo->exec('DELETE FROM cv_tokens WHERE expires_at < NOW()');
        out(['token' => newToken($pdo, (int) $user['id']), 'email' => $email]);

    case 'me':
        $u = currentUser($pdo);
        out(['email' => $u['email']]);

    case 'logout':
        currentUser($pdo);
        $pdo->prepare('DELETE FROM cv_tokens WHERE token_hash = ?')->execute([hash('sha256', $_SERVER['HTTP_X_AUTH_TOKEN'])]);
        out(['ok' => true]);

    case 'pull':
        $u = currentUser($pdo);
        $q = $pdo->prepare('SELECT data, updated_at FROM cv_data WHERE user_id = ?');
        $q->execute([$u['id']]);
        $row = $q->fetch();
        out(['data' => $row ? json_decode($row['data'], true) : null, 'updatedAt' => $row ? (int) $row['updated_at'] : 0]);

    case 'push':
        $u = currentUser($pdo);
        if (!isset($body['data']) || !is_array($body['data'])) {
            fail(400, 'Dados inválidos.');
        }
        $json = json_encode($body['data'], JSON_UNESCAPED_UNICODE);
        if (strlen($json) > 5 * 1024 * 1024) {
            fail(413, 'Dados grandes demais (máx. 5 MB).');
        }
        $pdo->prepare('INSERT INTO cv_data (user_id, data, updated_at) VALUES (?, ?, ?)
                       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)')
            ->execute([$u['id'], $json, (int) round(microtime(true) * 1000)]);
        out(['ok' => true]);

    default:
        fail(404, 'Ação desconhecida.');
}
