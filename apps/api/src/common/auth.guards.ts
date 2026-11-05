import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { AppRole } from "@rwa/contracts";

import { IS_PUBLIC, ROLES, type SessionUser } from "./auth.decorators";

/** Requires a valid bearer JWT on every route not marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const header: string | undefined = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; role: AppRole }>(token);
        request.user = { wallet: payload.sub.toLowerCase() as `0x${string}`, role: payload.role } satisfies SessionUser;
      } catch {
        if (!isPublic) throw new UnauthorizedException("Session expired. Sign in again.");
      }
    }
    if (isPublic) return true;
    if (!request.user) throw new UnauthorizedException("Sign in with your wallet first.");
    return true;
  }
}

/** Enforces @Roles(...) after authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user: SessionUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException("Your role does not allow this action.");
    }
    return true;
  }
}
