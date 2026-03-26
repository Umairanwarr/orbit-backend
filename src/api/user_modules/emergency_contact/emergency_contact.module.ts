import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmergencyContactSchema } from './emergency_contact.entity';
import { EmergencyContactService } from './emergency_contact.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'emergency_contacts', schema: EmergencyContactSchema },
    ]),
  ],
  providers: [EmergencyContactService],
  exports: [EmergencyContactService],
})
export class EmergencyContactModule {}
