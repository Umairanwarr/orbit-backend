<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Email (SendGrid) Setup

This project supports SendGrid via SMTP out of the box. Configure the following environment variables in your environment files at `backend/src/`:

Create or edit `.env.development` and `.env.production` (examples are provided as `.env.development.example` and `.env.production.example`). Minimum required keys:

```
# SendGrid SMTP
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587          # 587 recommended; alternatively 2525
EMAIL_SECURE=false      # true only if you use port 465
EMAIL_FROM=no-reply@orbit.ke   # must be a verified sender/domain in SendGrid
EMAIL_TO=info@orbit.ke         # optional: default admin recipient

# Optional timeouts and debug
EMAIL_DEBUG=false
EMAIL_CONNECTION_TIMEOUT=10000
EMAIL_GREETING_TIMEOUT=10000
EMAIL_SOCKET_TIMEOUT=10000
```

Notes:

- Verify your single sender or domain in SendGrid before sending.
- On DigitalOcean, port 25 is blocked. Port 587 usually works; 2525 is also supported by SendGrid.

### Test SMTP locally

Use the included script to verify configuration and send a test email:

```
# Development env
node src/scripts/test-smtp.js --env=development

# Production env
node src/scripts/test-smtp.js --env=production

# Or load a specific file
node src/scripts/test-smtp.js --env-file=/absolute/path/to/.env.custom
```

The script will print the chosen provider, host, port, and will attempt a connection and send a test email to `TEST_EMAIL_TO` or `EMAIL_TO` (falls back to `EMAIL_FROM`).

### Deploying on DigitalOcean

- Place your `.env.production` in `backend/src/` on the server.
- Build and start with PM2 (example):

```
npm ci
npm run build
pm2 start ecosystem.config.js --env production
```

PM2 will set `NODE_ENV=production`, and the app will load `backend/src/.env.production` automatically as configured in `src/app.module.ts` (`ConfigModule.forRoot`).

## SMS (Twilio) Setup (Phone Registration)

Phone number registration sends verification links via SMS using Twilio. Configure the following environment variables:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Either provide a sender phone OR a messaging service SID
TWILIO_FROM=+1234567890
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notes:

- `TWILIO_FROM` must be a Twilio-owned phone number in E.164 format.
- If you set `TWILIO_MESSAGING_SERVICE_SID`, the backend will use it instead of `TWILIO_FROM`.

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
