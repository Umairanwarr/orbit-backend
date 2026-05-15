import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthClientService } from '../../common/auth_client/auth_client.service';
import { UserRole } from '../utils/enums';

@Injectable()
export class IsSellerGuard implements CanActivate {
  constructor(private readonly authClient: AuthClientService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers['authorization'] || request.headers['Authorization'];
    if (!authorization) throw new BadRequestException('authorization key in headers is required');
    if (!authorization.toString().includes('Bearer')) {
      throw new BadRequestException('authorization key in headers is must start with Bearer');
    }
    const token = authorization.split('Bearer ')[1];
    if (!token) throw new BadRequestException('Token after Bearer" "must be starting ');

    const user = await this.authClient.getVerifiedUser(token);
    const roles: any[] = Array.isArray((user as any)?.roles) ? (user as any).roles : [];
    if (!roles.includes(UserRole.Seller)) {
      throw new BadRequestException('Only seller users can access this endpoint');
    }

    request.user = user;
    return true;
  }
}
