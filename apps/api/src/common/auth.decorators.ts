import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AppRole } from "@rwa/contracts";

export const IS_PUBLIC = "isPublic";
export const ROLES = "roles";

/** Skips the JWT guard for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Limits a route or controller to the listed roles. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES, roles);

export type SessionUser = {
  wallet: `0x${string}`; // lower-case
  role: AppRole;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user,
);
