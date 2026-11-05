import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { APP_CONFIG, type AppConfig } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.use(helmet());
  app.enableCors({ origin: config.webOrigin, credentials: false, maxAge: 600 });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(`API listening on http://localhost:${config.port}`, "Bootstrap");
}

void bootstrap();
