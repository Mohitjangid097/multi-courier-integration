import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShipmentStatus } from '../libs/constants';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  order_id: string;

  @Column()
  courier_partner: string;

  @Column({ nullable: true })
  courier_order_id: string;

  @Column({ nullable: true })
  awb_number: string;

  @Column({ default: ShipmentStatus.CREATED })
  status: string;

  @Column({ type: 'simple-json' })
  request_payload: object;

  @Column({ type: 'simple-json', nullable: true })
  response_payload: object;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
