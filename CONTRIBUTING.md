# Contributing

## Branch naming

```text
feature/description
fix/description
hotfix/description
```

## Workflow

```text
1. Pull latest develop
2. Create branch
3. Make changes
4. Test locally
5. Commit
6. Push branch
7. Create Pull Request
8. Wait for review
9. Address feedback
10. Merge after approval
```

Developers must not push directly to `main`. `main` is production-ready code only; `develop` is the integration branch. Production deployment and production credentials are owner-controlled; contributors never need Vercel access.

Never commit secrets or `.env` files. Add new variable NAMES to `.env.example` and `docs/ENVIRONMENT_VARIABLES.md`.
