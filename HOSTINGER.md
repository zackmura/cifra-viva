# Publicar o Cifra Viva na Hostinger

Endereço sugerido: **https://cifras.vivainteligente.net**

## 1. Criar o subdomínio
1. hPanel → **Sites** → `vivainteligente.net` → **Domínios → Subdomínios**.
2. Em *Subdomínio* digite `cifras` e clique em **Criar**.
   A pasta dele será `public_html/cifras`.

## 2. Ligar o SSL (https) — obrigatório para o microfone
1. hPanel → **Segurança → SSL**.
2. Se `cifras.vivainteligente.net` não aparecer como ativo, clique em **Instalar SSL** para ele.
   Pode levar alguns minutos.

## 3. Criar o banco de dados (para conta e sincronização)
1. hPanel → **Bancos de dados → Gerenciamento**.
2. Nome do banco: `cifraviva` · Usuário: `cifraviva` · Senha: crie uma forte e **anote**.
3. Clique em **Criar**. O nome completo fica `u625278914_cifraviva` (o prefixo é o seu).

## 4. Enviar os arquivos
**Opção A — ZIP (mais simples)**
1. No computador, rode `powershell -ExecutionPolicy Bypass -File empacotar.ps1` na pasta do projeto.
   Isso gera `cifra-viva-hostinger.zip`.
2. hPanel → **Arquivos → Gerenciador de Arquivos** → abra `public_html/cifras`.
3. Apague o `default.php` (se existir), clique em **Enviar** e mande o ZIP.
4. Clique com o botão direito no ZIP → **Extrair** (para a própria pasta `cifras`) → depois apague o ZIP.

**Opção B — Git (atualiza com um clique)**
1. Envie o projeto para o GitHub (`git push`).
2. hPanel → **Avançado → GIT** → repositório `https://github.com/SEU_USUARIO/cifra-viva.git`,
   branch `main`, diretório `cifras` → **Criar**. (A pasta precisa estar vazia.)
3. Para atualizar depois: `git push` e clique em **Implantar** no hPanel.

## 5. Configurar a API
1. No Gerenciador de Arquivos, entre em `public_html/cifras/api`.
2. Copie `config.sample.php` com o nome **`config.php`** e edite:
   ```php
   'db_name' => 'u625278914_cifraviva',
   'db_user' => 'u625278914_cifraviva',
   'db_pass' => 'A SENHA QUE VOCÊ CRIOU',
   'allow_register' => true,
   ```
3. Salve. As tabelas são criadas sozinhas no primeiro acesso.

## 6. Criar a sua conta e trancar o cadastro
1. Abra **https://cifras.vivainteligente.net** → **👤 Entrar** → preencha e clique em **Criar conta**.
2. Volte ao `api/config.php` e troque para `'allow_register' => false`.
   Assim ninguém mais consegue se cadastrar.

## 7. No celular
Abra o endereço no Chrome, permita o microfone e use o menu ⋮ → **Adicionar à tela inicial**.
Entre na mesma conta no celular e no computador: suas cifras e progresso sincronizam sozinhos.

## Atualizar o site depois de mudanças
`node build.js` → gere o ZIP de novo (ou `git push` na opção B) → envie e extraia por cima.
O `api/config.php` não é sobrescrito porque não está no ZIP nem no Git.
