import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ASSET_CLASSES } from "@rwa/contracts";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import type { Repository } from "typeorm";
import { keccak256, toHex } from "viem";

import { canonicalJson } from "../audit/audit-hash";
import { AuditService } from "../audit/audit.service";
import { CurrentUser, Public, Roles, type SessionUser } from "../common/auth.decorators";
import { APP_CONFIG, type AppConfig } from "../config";
import { AssetProfile } from "../database/entities";

class DocumentDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @Matches(/^[0-9a-f]{64}$/)
  sha256: string;
}

class CreateProfileDto {
  @IsString()
  @Length(3, 120)
  name: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2])
  assetClass: number;

  @IsString()
  @Length(2, 160)
  location: string;

  @IsString()
  @Length(20, 4000)
  description: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @Length(2, 140, { each: true })
  highlights: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DocumentDto)
  documents: DocumentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  targetYieldBps?: number;

  @IsOptional()
  @IsIn(["Monthly", "Quarterly", "Semi-annual", "Annual"])
  distributionFrequency?: string;
}

/**
 * Off-chain asset descriptions. The asset manager creates a profile first, then passes the returned
 * metadata URI and document hash to AssetFactory.createAsset from their wallet.
 */
@Controller()
export class AssetsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(AssetProfile) private readonly profiles: Repository<AssetProfile>,
    private readonly audit: AuditService,
  ) {}

  @Post("assets/profiles")
  @Roles("ASSET_MANAGER")
  async create(@CurrentUser() user: SessionUser, @Body() dto: CreateProfileDto) {
    const documentHash = keccak256(toHex(canonicalJson(dto.documents)));
    const profile = await this.profiles.save(
      this.profiles.create({
        ...dto,
        targetYieldBps: dto.targetYieldBps ?? null,
        distributionFrequency: dto.distributionFrequency ?? null,
        documentHash,
        createdBy: user.wallet,
      }),
    );
    await this.audit.append({
      actorWallet: user.wallet,
      actorRole: user.role,
      action: "ASSET_PROFILE_CREATED",
      entityType: "ASSET_PROFILE",
      entityId: profile.id,
      summary: `Prepared asset profile "${profile.name}" (${ASSET_CLASSES[profile.assetClass]})`,
      details: { documentHash, documents: dto.documents.length },
    });
    return { ...profile, metadataURI: this.metadataUri(profile.id) };
  }

  @Public()
  @Get("assets/profiles/:id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const profile = await this.profiles.findOneBy({ id });
    if (!profile) throw new NotFoundException("Asset profile not found");
    return { ...profile, metadataURI: this.metadataUri(profile.id) };
  }

  /** ERC-721 metadata for the deed NFT (AssetRegistry.tokenURI). */
  @Public()
  @Get("metadata/:id")
  async metadata(@Param("id", ParseUUIDPipe) id: string) {
    const p = await this.profiles.findOneBy({ id });
    if (!p) throw new NotFoundException("Asset profile not found");
    const slug = ["real-estate", "private-credit", "investment-fund"][p.assetClass];
    return {
      name: p.name,
      description: p.description,
      image: `${this.config.webOrigin}/asset-classes/${slug}.svg`,
      external_url: this.config.webOrigin,
      attributes: [
        { trait_type: "Asset class", value: ASSET_CLASSES[p.assetClass] },
        { trait_type: "Location", value: p.location },
        ...(p.targetYieldBps != null
          ? [{ trait_type: "Target yield", value: `${(p.targetYieldBps / 100).toFixed(2)}%` }]
          : []),
        ...(p.distributionFrequency ? [{ trait_type: "Distributions", value: p.distributionFrequency }] : []),
      ],
      documents: p.documents,
      document_hash: p.documentHash,
    };
  }

  private metadataUri(id: string) {
    return `${this.config.publicApiUrl}/metadata/${id}`;
  }
}
