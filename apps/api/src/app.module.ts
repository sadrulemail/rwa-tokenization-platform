import { Controller, Get, Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource, type DataSourceOptions } from "typeorm";

import { AssetsController } from "./assets/assets.controller";
import { AuditController } from "./audit/audit.controller";
import { AuditService } from "./audit/audit.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { ChainService } from "./chain/chain.service";
import { Public } from "./common/auth.decorators";
import { JwtAuthGuard, RolesGuard } from "./common/auth.guards";
import { APP_CONFIG, type AppConfig, loadConfig } from "./config";
import { ENTITIES } from "./database/entities";
import { InitialSchema1762300000000 } from "./database/migrations/1762300000000-InitialSchema";
import { ComplianceController, KycController } from "./kyc/kyc.controller";
import { KycService } from "./kyc/kyc.service";
import { ScreeningService } from "./kyc/screening.service";
import { MarketController } from "./market/market.controller";
import { MarketService } from "./market/market.service";

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class AppConfigModule {}

@Controller("health")
class HealthController {
  constructor(private readonly chain: ChainService) {}

  @Public()
  @Get()
  async health() {
    const block = await this.chain.publicClient.getBlockNumber().catch(() => null);
    return { status: "ok", chainId: this.chain.chain.id, block: block?.toString() ?? null };
  }
}

export function databaseOptions(config: AppConfig): DataSourceOptions {
  return {
    type: "postgres",
    url: config.databaseUrl,
    schema: "app",
    entities: ENTITIES,
    migrations: [InitialSchema1762300000000],
    migrationsTableName: "migrations",
    synchronize: false,
    logging: ["error"],
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [".env", "../../.env"], isGlobal: true }),
    AppConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    JwtModule.registerAsync({
      global: true,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.jwtTtl as `${number}h` },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => databaseOptions(config),
      // Create the app schema before TypeORM's migrations table, then migrate.
      dataSourceFactory: async (options) => {
        const ds = await new DataSource(options!).initialize();
        await ds.query("CREATE SCHEMA IF NOT EXISTS app");
        await ds.runMigrations({ transaction: "each" });
        return ds;
      },
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  controllers: [
    HealthController,
    AuthController,
    KycController,
    ComplianceController,
    AuditController,
    MarketController,
    AssetsController,
  ],
  providers: [
    ChainService,
    AuditService,
    AuthService,
    ScreeningService,
    KycService,
    MarketService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
