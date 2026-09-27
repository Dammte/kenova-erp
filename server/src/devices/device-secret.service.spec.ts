import { BadRequestException } from '@nestjs/common';
import { DeviceSecretService } from './device-secret.service';
import { UnlockSecretType } from './entities/device.entity';

describe('DeviceSecretService.pick', () => {
  it('keeps the current secret when nothing is sent', () => {
    expect(DeviceSecretService.pick({})).toBeUndefined();
    expect(
      DeviceSecretService.pick({ code: '', pattern: '  ' }),
    ).toBeUndefined();
    expect(
      DeviceSecretService.pick({ code: null, pattern: null }),
    ).toBeUndefined();
  });

  it('stores a code or a pattern', () => {
    expect(DeviceSecretService.pick({ code: ' 1234 ' })).toEqual({
      type: UnlockSecretType.CODE,
      value: '1234',
    });
    expect(DeviceSecretService.pick({ pattern: '1-5-9' })).toEqual({
      type: UnlockSecretType.PATTERN,
      value: '1-5-9',
    });
  });

  it('rejects both at once', () => {
    expect(() =>
      DeviceSecretService.pick({ code: '1', pattern: '1-2' }),
    ).toThrow(BadRequestException);
  });
});
