# SOPS — Encrypted Environment Files

This project uses [SOPS](https://github.com/getsops/sops) with [age](https://github.com/FiloSottile/age) encryption to securely store secrets (like GitHub OAuth credentials) in the repository. Encryption is tied to team members' SSH keys, so only authorized people can decrypt.

## How It Works

```bash
SSH ed25519 key  →  ssh-to-age  →  age key  →  SOPS encrypts/decrypts encrypted.env
```

Each team member's SSH public key (from GitHub) is converted into an age recipient key. SOPS uses these age keys to encrypt `encrypted.env` so that **any** team member with their corresponding SSH private key can decrypt it.

The secrets never need to be stored as a plaintext file on disk. Instead, `sops exec-env` loads them directly into memory as environment variables when you run your app.

## Prerequisites

You need three tools installed: **sops**, **age**, and **ssh-to-age**.

### Install on Debian/Ubuntu

```bash
# age
sudo apt update
sudo apt install -y age

# sops (download latest .deb from GitHub releases)
SOPS_VERSION=$(curl -sf https://api.github.com/repos/getsops/sops/releases/latest | grep tag_name | cut -d'"' -f4)
curl -LO "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops_${SOPS_VERSION#v}_amd64.deb"
sudo dpkg -i sops_*.deb
rm sops_*.deb

# Go (needed for ssh-to-age, Debian's default version is too old)
curl -LO https://go.dev/dl/go1.24.2.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.24.2.linux-amd64.tar.gz
rm go1.24.2.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin:~/go/bin' >> ~/.bashrc
source ~/.bashrc

# ssh-to-age
go install github.com/Mic92/ssh-to-age/cmd/ssh-to-age@latest
```

### Verify Installation

```bash
sops --version
age --version
ssh-to-age --version
```

## SSH Key Requirement

SOPS + age via ssh-to-age **only supports ed25519 SSH keys**. Check your key type:

```bash
head -1 ~/.ssh/id_ed25519.pub
# Should start with: ssh-ed25519 AAAA...
```

If you don't have an ed25519 key, generate one:

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Then add the new public key to your [GitHub account](https://github.com/settings/keys) as an Authentication Key.

## Setting Up Your Age Key (Every Team Member)

Convert your SSH private key to an age secret key and store it where SOPS can find it:

```bash
mkdir -p ~/.config/sops/age
ssh-to-age -private-key -i ~/.ssh/id_ed25519 > ~/.config/sops/age/keys.txt
```

Verify it worked:

```bash
cat ~/.config/sops/age/keys.txt
# Should start with: AGE-SECRET-KEY-...
```

SOPS automatically looks in `~/.config/sops/age/keys.txt`, so you don't need to export any environment variables.

**Important:** If you have multiple ed25519 keys, make sure the one you convert matches the public key that was used in `.sops.yaml`. You can check your age public key with:

```bash
cat ~/.ssh/id_ed25519.pub | ssh-to-age
```

This should match one of the recipient keys in `.sops.yaml`.

## Initial Setup (One-Time, Maintainer Only)

Run the setup script to fetch all team members' SSH keys from GitHub and generate `.sops.yaml`:

```bash
chmod +x scripts/setup-sops.sh
./scripts/setup-sops.sh
```

setup-sops.sh is now named DONTTOCH.sh because it does not need to be done again

This will:

1. Fetch each team member's SSH public keys from `github.com/<username>.keys`
2. Convert them to age recipient keys
3. Write the `.sops.yaml` configuration

**Important:** If a team member has multiple ed25519 keys on GitHub, verify that the correct age public key was picked. Each member can check with `cat ~/.ssh/id_ed25519.pub | ssh-to-age` and compare against the keys in `.sops.yaml`.

Then create and encrypt the `.env` file:

```bash
nano .env
# Add your secrets, e.g.:
# GITHUB_CLIENT_ID=your_client_id
# GITHUB_SECRET=your_client_secret
# GITHUB_OAUTH_SCOPES=read:user,user:email,read:org
# POSTGRES_DB=openml_upload
# POSTGRES_USER=openml_upload
# POSTGRES_PASSWORD=change_me
# GH_APP_ID=your_github_app_id
# GH_INSTALL_ID=your_github_installation_id
# GH_PRIV_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

sops -e --input-type dotenv --output-type dotenv .env > encrypted.env
rm .env
```

Commit both `.sops.yaml` and `encrypted.env`. **Never commit the plaintext `.env` file.**

## Running Your App with Secrets (Every Team Member)

Instead of decrypting to a file, use `sops exec-env` to load secrets directly into memory:

```bash
sops exec-env encrypted.env 'npm run start'
```

Or for Python:

```bash
sops exec-env encrypted.env 'python main.py'
```

For the Docker Compose stack, pass the decrypted environment to Compose at runtime:

```bash
sops exec-env encrypted.env 'docker compose -f compose.yml up -d --build'
```

Use this exact command whenever you start, rebuild, or restart the local Compose stack with encrypted secrets. Running plain `docker compose up -d --build` does not read `encrypted.env`; Compose will use defaults from `compose.yml`, leaving secrets such as `GITHUB_CLIENT_ID`, `GITHUB_SECRET`, and GitHub App credentials unset.

Do not use `env_file: encrypted.env`, copy `.env` or `encrypted.env` into the image, or install SOPS inside the app container. Compose maps the runtime environment into the services.

For Docker, keep the Postgres values as `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The Compose stack builds the in-container `DATABASE_URI` from those values, so a local-development `DATABASE_URI` in `encrypted.env` is not used by the Docker stack.

The secrets only exist in your computer's RAM while the app is running. There is zero risk of accidentally committing a plaintext `.env` file.

To quickly verify that decryption works:

```bash
sops exec-env encrypted.env 'env | grep GITHUB'
```

## Editing Secrets

SOPS supports in-place editing, which decrypts the file in your editor and re-encrypts on save:

```bash
sops encrypted.env
```

This opens the decrypted content in `$EDITOR` (defaults to `vim`). When you save and close, SOPS automatically re-encrypts the file. Commit the updated `encrypted.env` afterwards.

## Adding a New Team Member

1. The new member must have an ed25519 SSH key on their GitHub account.
2. Add their username to the `TEAM_MEMBERS` array in `scripts/setup-sops.sh`.
3. Re-run the setup script to regenerate `.sops.yaml`.
4. Re-encrypt the file so the new member can decrypt it:

   ```bash
   sops updatekeys encrypted.env
   ```

5. Commit the updated `.sops.yaml` and `encrypted.env`.

## Removing a Team Member

1. Remove their username from `TEAM_MEMBERS` in `scripts/setup-sops.sh`.
2. Re-run `./scripts/setup-sops.sh`.
3. Re-encrypt:

   ```bash
   sops updatekeys encrypted.env
   ```

4. **Rotate all secrets** — the removed member may still have the old plaintext values.
5. Commit everything.

## Recommended .gitignore Entries

```gitignore
# Plaintext secrets — NEVER commit
.env
```

## Troubleshooting

**"could not decrypt data key"** — Your SSH key is not in the recipients list in `.sops.yaml`, or you're using an RSA key instead of ed25519.

**"ssh-to-age: unsupported key type"** — You need an ed25519 SSH key. Generate one with `ssh-keygen -t ed25519`.

**"no matching creation rules found"** — Make sure `.sops.yaml` is in the project root and the `path_regex` matches your encrypted filename.

**"Error unmarshalling input json"** — The file was encrypted without specifying dotenv format. Re-encrypt with `sops -e --input-type dotenv --output-type dotenv .env > encrypted.env`.

**"no identity matched any of the recipients"** — Your age key doesn't match any recipient in the encrypted file. Check your age public key with `cat ~/.ssh/id_ed25519.pub | ssh-to-age` and compare it to the keys in `.sops.yaml`. If you have multiple ed25519 keys, you may need to convert a different one.

**YAML indentation errors in `.sops.yaml`** — Make sure `age:` is indented with 4 spaces (under `path_regex`) and the keys with 6 spaces. Also double-check for typos (e.g. `creation_rules`, not `creation_tules`).

## Team Members

The following GitHub users have decryption access:

| GitHub Username |
| --------------- |
| c0ffeeadd1c7    |
| Johk3           |
| gabrielmeleiro1 |
| koevoet1221     |
| AlexKoops       |
| QuintoniusB     |
| jortvanleenen   |
