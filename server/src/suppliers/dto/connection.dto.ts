import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** https://host[:port] with nothing after it: the routes go apart. */
const BASE_URL =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/i;
/** /a/b?c=d — a route on that host, never another address. */
const PATH = /^\/(?!\/)[^\s\\]*$/;
const NO_DOTS = /^(?!.*(^|\/)\.\.?(\/|\?|$))/;
/** data.orders, order_lines, items.0.price */
const FIELD = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/;

const Route = (label: string) =>
  applyDecorators(
    Transform(trim),
    IsString(),
    MaxLength(300),
    Matches(PATH, { message: `${label}: debe empezar por /` }),
    Matches(NO_DOTS, { message: `${label}: no puede llevar «..»` }),
  );
const Field = (label: string) =>
  applyDecorators(
    Transform(trim),
    IsString(),
    MaxLength(100),
    Matches(FIELD, {
      message: `${label}: escribe el nombre del campo, con puntos si va dentro de otro (data.pedidos)`,
    }),
  );
/** Left empty, it is saved as null. */
const Optional = (inner: PropertyDecorator) =>
  applyDecorators(Transform(emptyToNull), IsOptional(), inner);

export class LoginDto {
  @Route('Ruta de inicio de sesión')
  path: string;

  @IsIn(['json', 'form'], { message: 'Formato de inicio de sesión no válido' })
  format: 'json' | 'form';

  @Field('Campo del usuario')
  userField: string;

  @Field('Campo de la contraseña')
  passwordField: string;

  @IsIn(['cookie', 'token'], { message: 'Indica cómo se mantiene la sesión' })
  session: 'cookie' | 'token';

  @Transform(emptyToNull)
  @ValidateIf((o: LoginDto) => o.session === 'token' || o.tokenPath != null)
  @IsNotEmpty({ message: 'Indica dónde viene el token' })
  @Field('Dónde viene el token')
  tokenPath: string | null;
}

export class OrdersDto {
  @Route('Ruta de la lista de pedidos')
  listPath: string;

  @Optional(Field('Dónde está la lista'))
  itemsPath: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @Route('Ruta del detalle')
  @Matches(/\{id\}/, { message: 'Ruta del detalle: tiene que llevar {id}' })
  detailPath: string | null;

  @Field('Id del pedido')
  idField: string;

  @Optional(Field('Número del pedido'))
  numberField: string | null;

  @Optional(Field('Fecha del pedido'))
  dateField: string | null;

  @Field('Dónde están las líneas')
  linesPath: string;

  @Optional(Field('Referencia'))
  refField: string | null;

  @Field('Descripción')
  descriptionField: string;

  @Field('Cantidad')
  quantityField: string;

  @Field('Coste por unidad')
  unitCostField: string;
}

export class SupplierConnectionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value,
  )
  @IsString()
  @MaxLength(200)
  @Matches(BASE_URL, {
    message:
      'Dirección base: solo https:// y el dominio, sin rutas (https://b2b.proveedor.es)',
  })
  baseUrl: string;

  @ValidateNested()
  @Type(() => LoginDto)
  login: LoginDto;

  @ValidateNested()
  @Type(() => OrdersDto)
  orders: OrdersDto;
}

export class SupplierCredentialsDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Escribe el usuario' })
  @MaxLength(150)
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Escribe la contraseña' })
  @MaxLength(200)
  password: string;
}
