import { UserRole } from '../users/entities/user.entity';
import { ServiceStatus as S } from './entities/service-order.entity';
import { transitionProblem } from './status-transitions';

const SUPER = UserRole.SUPER_ADMIN;
const STORE = UserRole.STORE_ADMIN;

describe('transitionProblem', () => {
  it('moves freely between the open statuses', () => {
    const open = [S.EN_PROGRESO, S.PENDIENTE_CLIENTE, S.PENDIENTE_PIEZAS];
    for (const from of open)
      for (const to of [...open, S.FINALIZADO, S.CANCELADO])
        expect(transitionProblem(from, to, STORE)).toBeNull();
  });

  it('delivers a finished order, or straight from the workshop', () => {
    expect(transitionProblem(S.FINALIZADO, S.ENTREGADO, STORE)).toBeNull();
    expect(transitionProblem(S.EN_PROGRESO, S.ENTREGADO, STORE)).toBeNull();
    expect(transitionProblem(S.CANCELADO, S.ENTREGADO, STORE)).toMatch(
      /cancelada/,
    );
  });

  it('lets a finished order go back to work', () => {
    expect(transitionProblem(S.FINALIZADO, S.EN_PROGRESO, STORE)).toBeNull();
  });

  it('only the partners reopen a delivered or cancelled order', () => {
    expect(transitionProblem(S.CANCELADO, S.EN_PROGRESO, STORE)).toMatch(
      /cancelada/,
    );
    expect(transitionProblem(S.ENTREGADO, S.FINALIZADO, STORE)).toMatch(
      /entregada/,
    );
    expect(transitionProblem(S.CANCELADO, S.EN_PROGRESO, SUPER)).toBeNull();
    expect(transitionProblem(S.ENTREGADO, S.FINALIZADO, SUPER)).toBeNull();
  });

  it('keeping the same status is never a problem', () => {
    expect(transitionProblem(S.ENTREGADO, S.ENTREGADO, STORE)).toBeNull();
  });
});
