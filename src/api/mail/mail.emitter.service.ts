import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import date from "date-and-time";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { IUser } from "../user_modules/user/entities/user.entity";
import { MailType } from "../../core/utils/enums";
import { SendMailEvent } from "../../core/utils/interfaceces";
import { i18nApi } from "../../core/utils/res.helpers";

@Injectable()
export class MailEmitterService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async sendConfirmEmail(user: IUser, mailType: MailType, isDev: boolean) {
    let code = Math.floor(100000 + Math.random() * 900000);

    // For reset password and verify email, always send the email even in development mode
    // For other email types, skip in development mode
    if (
      isDev &&
      mailType !== MailType.ResetPassword &&
      mailType !== MailType.VerifyEmail
    ) {
      return code;
    }
    if (user.lastMail && user.lastMail.sendAt) {
      let min = parseInt(
        date.subtract(new Date(), user.lastMail.sendAt).toMinutes().toString(),
        10
      );
      if (min < 2) {
        throw new BadRequestException(i18nApi.wait2MinutesToSendMail);
      }
    }

    let x = new SendMailEvent();
    x.code = code.toString();
    x.user = user;
    x.mailType = mailType;
    this.eventEmitter.emit("send.mail", x);
    return code;
  }
  async sendResetPasswordLink(user: IUser, resetLink: string, isDev: boolean) {
    console.log(`Sending reset password link to: ${user.email}, isDev: ${isDev}`);
    console.log(`Reset link: ${resetLink}`);
    try {
      const c = (this.eventEmitter as any).listenerCount
        ? (this.eventEmitter as any).listenerCount('send.mail')
        : ((this.eventEmitter as any).listeners ? (this.eventEmitter as any).listeners('send.mail').length : 'n/a');
      console.log(`MailEmitterService: listeners for send.mail = ${c}`);
    } catch (e) {}
    
    // Always send email for reset password (same as signup email logic)
    // Check rate limiting like signup email does
    if (user.lastMail && user.lastMail.sendAt) {
      let min = parseInt(
        date.subtract(new Date(), user.lastMail.sendAt).toMinutes().toString(),
        10
      );
      if (min < 2) {
        throw new BadRequestException(i18nApi.wait2MinutesToSendMail);
      }
    }

    let x = new SendMailEvent();
    x.code = resetLink; // instead of numeric code, send the link
    x.user = user;
    x.mailType = MailType.ResetPassword;
    
    console.log("Emitting send.mail event for reset password");
    this.eventEmitter.emit("send.mail", x);

    if (isDev) {
      return `Password reset link has been sent to your email. Dev link: ${resetLink}`;
    }
    return "Password reset link has been sent to your email";
  }

  async sendVerificationLink(
    user: IUser,
    verificationLink: string,
    isDev: boolean
  ) {
    console.log(
      `Sending verification link to: ${user.email}, isDev: ${isDev}`
    );
    console.log(`Verification link: ${verificationLink}`);
    try {
      const c = (this.eventEmitter as any).listenerCount
        ? (this.eventEmitter as any).listenerCount('send.mail')
        : ((this.eventEmitter as any).listeners ? (this.eventEmitter as any).listeners('send.mail').length : 'n/a');
      console.log(`MailEmitterService: listeners for send.mail = ${c}`);
    } catch (e) {}

    // Apply same basic rate limiting if we have lastMail info
    if (user.lastMail && user.lastMail.sendAt) {
      let min = parseInt(
        date.subtract(new Date(), user.lastMail.sendAt).toMinutes().toString(),
        10
      );
      if (min < 2) {
        throw new BadRequestException(i18nApi.wait2MinutesToSendMail);
      }
    }

    const event = new SendMailEvent();
    event.code = verificationLink; // reuse 'code' field to carry the link
    event.user = user;
    event.mailType = MailType.VerifyEmail;

    console.log("Emitting send.mail event for email verification");
    this.eventEmitter.emit("send.mail", event);

    if (isDev) {
      return `Verification link has been sent to your email. Dev link: ${verificationLink}`;
    }
    return "Verification link has been sent to your email";
  }

  async sendTwoFactorCode(user: IUser, code: string) {
    // No rate limiting here to avoid blocking login
    const event = new SendMailEvent();
    event.code = code;
    event.user = user;
    event.mailType = MailType.TwoFactorAuth;
    this.eventEmitter.emit("send.mail", event);
    return true;
  }
}
