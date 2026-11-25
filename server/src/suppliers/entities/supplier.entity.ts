import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * How the ERP reads this supplier's orders from its website. Every route and
 * field name is data, so a change on the supplier's side is fixed here,
 * not in code. Field names are dot paths into the JSON ("data.orders").
 */
export interface SupplierConnection {
  /** https://… — the only host the ERP calls for this supplier. */
  baseUrl: string;
  login: {
    path: string;
    format: 'json' | 'form';
    userField: string;
    passwordField: string;
    /** How the session is kept after logging in. */
    session: 'cookie' | 'token';
    /** Where the token comes in the login answer (session "token"). */
    tokenPath: string | null;
  };
  orders: {
    /** The list of orders. */
    listPath: string;
    /** Where the list is inside the answer; null = the answer itself. */
    itemsPath: string | null;
    /** One order, with {id}; null when the list already brings the lines. */
    detailPath: string | null;
    idField: string;
    numberField: string | null;
    dateField: string | null;
    linesPath: string;
    refField: string | null;
    descriptionField: string;
    quantityField: string;
    unitCostField: string;
  };
}

/**
 * A company Kenova buys parts from. Never deleted: a supplier that is no
 * longer used is deactivated, so past purchases keep their name.
 * The name is unique ignoring case (index UQ_suppliers_name on lower(name)).
 */
@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** CIF / NIF. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  taxId: string | null;

  /** Kenova's customer number at the supplier. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  customerNumber: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'jsonb', nullable: true })
  connection: SupplierConnection | null;

  /**
   * The login on the supplier's website, {username, password} encrypted
   * (AES-256-GCM, the device-secret key). Never selected unless asked for and
   * never sent to the browser.
   */
  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
    select: false,
  })
  credentialsCiphertext?: string | null;

  /** When the login was last saved; null = there is none. */
  @Column({ type: 'timestamptz', nullable: true })
  credentialsUpdatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
