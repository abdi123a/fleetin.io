import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    /* Registered empty on purpose: every sign() passes its own secret and
     * expiry, because access and refresh tokens are signed with *different*
     * keys. A module-level default would make it easy to sign a refresh token
     * with the access secret by omission. */
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenService],
  exports: [AuthService, JwtStrategy, RefreshTokenService, PassportModule],
})
export class AuthModule {}
