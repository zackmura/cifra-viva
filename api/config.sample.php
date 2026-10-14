<?php
// Copie este arquivo para "config.php" (na mesma pasta) e preencha com os dados do
// banco MySQL que você criou no painel da Hostinger (Sites > Bancos de dados).
// O config.php NÃO vai para o Git (está no .gitignore) porque tem a senha do banco.
return [
    'db_host' => 'localhost',
    'db_name' => 'u000000000_cifraviva',   // Nome da base de dados MySQL
    'db_user' => 'u000000000_cifraviva',   // username MySQL
    'db_pass' => 'COLOQUE_A_SENHA_AQUI',

    // Deixe true só até criar a sua conta. Depois mude para false,
    // assim ninguém mais consegue se cadastrar no seu site.
    'allow_register' => true,
];
