import { createEmailSender } from './email.module';
import { ResendEmailSender } from './resend-email.sender';

describe('ResendEmailSender', () => {
  const message = {
    to: 'ana@kenova.test',
    subject: 'S',
    text: 'T',
    html: '<p>T</p>',
  };

  it('posts the message to the Resend API with the key', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await new ResendEmailSender('re_key', 'Kenova <a@k.test>', fetchFn).send(
      message,
    );
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Kenova <a@k.test>',
      to: ['ana@kenova.test'],
      subject: 'S',
      text: 'T',
      html: '<p>T</p>',
    });
  });

  it('fails with the provider explanation on an error response', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response('domain not verified', { status: 403 }));
    await expect(
      new ResendEmailSender('k', 'f', fetchFn).send(message),
    ).rejects.toThrow(/403: domain not verified/);
  });
});

describe('createEmailSender', () => {
  it('is disabled unless a provider is configured', () => {
    expect(createEmailSender({}).enabled).toBe(false);
    expect(createEmailSender({ EMAIL_PROVIDER: 'log' }).enabled).toBe(true);
    expect(
      createEmailSender({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'k',
        EMAIL_FROM: 'f',
      }),
    ).toBeInstanceOf(ResendEmailSender);
  });
});
