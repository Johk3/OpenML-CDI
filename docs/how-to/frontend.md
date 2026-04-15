## Here is how you run the frontend tests

```bash
cd frontend
sops exec-env ../encrypted.env 'npx vitest run'
```

## Here is how you run the frontend

```bash
cd frontend
sops exec-env ../encrypted.env 'npm run dev'
```

## CI exception

Since the CI pipeline doesnt have sops I have configured the environment variable to default to using 500MB as the file upload size limited, allowing all of the tests to pass normally without using sops.
