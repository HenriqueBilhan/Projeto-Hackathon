# Conecta — Backend (NestJS + TypeORM + MySQL 8)

Documentação completa no [README da raiz](../README.md).

```bash
npm install
cp .env.example .env        # configure DB_ROOT_PASSWORD, DB_PASSWORD, JWT_ACCESS_SECRET, ADMIN_CPF, ADMIN_PASSWORD
npm run setup               # cria banco + usuário (db:setup), roda as migrations e o seed
npm run dev                 # http://localhost:3000 (API em /api/v1, Swagger em /docs, frontend na raiz)
npm test                    # unitários + integração (MySQL: banco conecta_test)
npm run test:external       # API real do Ministério da Saúde
npm run sync                # sincronização manual dos dados abertos
```
