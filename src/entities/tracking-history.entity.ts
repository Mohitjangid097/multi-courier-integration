import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tracking_history')
export class TrackingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  order_id: string;

  @Column()
  courier_partner: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'simple-json' })
  raw_payload: object;

  @CreateDateColumn()
  created_at: Date;
}
