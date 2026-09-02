/**
 * SMTP-details -> HTTPS API bridge.
 *
 * The app runs on a serverless edge runtime that cannot open raw TCP sockets,
 * so a real SMTP conversation is impossible. Instead the user configures the
 * usual SMTP details and we translate them into the matching provider's HTTPS
 * email API. The SMTP password is the provider API key in every case below.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

export type SendResult = { provider: string };

export type BridgeProvider = {
  id: string;
  label: string;
  hosts: string[];
  passwordHint: string;
};

export const BRIDGE_PROVIDERS: BridgeProvider[] = [
  {
    id: "resend",
    label: "Resend",
    hosts: ["smtp.resend.com"],
    passwordHint: "Use your Resend API key (re_...) as the SMTP password.",
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    hosts: ["smtp.sendgrid.net"],
    passwordHint: "Username is 'apikey'; password is your SendGrid API key (SG....).",
  },
  {
    id: "brevo",
    label: "Brevo (Sendinblue)",
    hosts: ["smtp-relay.brevo.com", "smtp-relay.sendinblue.com"],
    passwordHint: "Use a Brevo API v3 key (xkeysib-...) as the SMTP password.",
  },
  {
    id: "postmark",
    label: "Postmark",
    hosts: ["smtp.postmarkapp.com"],
    passwordHint: "Use your Postmark Server API token as the SMTP password.",
  },
  {
    id: "mailgun",
    label: "Mailgun",
    hosts: ["smtp.mailgun.org", "smtp.eu.mailgun.org"],
    passwordHint: "Use your Mailgun private API key (key-...) as the SMTP password.",
  },
  {
    id: "mailersend",
    label: "MailerSend",
    hosts: ["smtp.mailersend.net"],
    passwordHint: "Use your MailerSend API token as the SMTP password.",
  },
];

export function resolveProvider(host: string): BridgeProvider | null {
  const h = host.trim().toLowerCase();
  return BRIDGE_PROVIDERS.find((p) => p.hosts.includes(h)) ?? null;
}

async function post(url: string, headers: Record<string, string>, body: unknown, provider: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${provider} rejected the message [${res.status}]: ${(await res.text()).slice(0, 400)}`);
  }
}

export async function sendMail(
  config: SmtpConfig,
  message: { to: string[]; cc?: string[]; subject: string; html: string; text: string },
): Promise<SendResult> {
  const provider = resolveProvider(config.host);
  if (!provider) {
    throw new Error(
      `Mail host "${config.host}" is not supported by the HTTP bridge. Supported hosts: ${BRIDGE_PROVIDERS.flatMap((p) => p.hosts).join(", ")}.`,
    );
  }
  if (!config.password) throw new Error("SMTP password / API key is not set.");
  if (!config.fromEmail) throw new Error("Sender email address is not set.");
  if (!message.to.length) throw new Error("No recipients configured.");

  const from = `${config.fromName} <${config.fromEmail}>`;
  const cc = message.cc?.filter(Boolean) ?? [];

  switch (provider.id) {
    case "resend":
      await post(
        "https://api.resend.com/emails",
        { Authorization: `Bearer ${config.password}` },
        { from, to: message.to, ...(cc.length ? { cc } : {}), subject: message.subject, html: message.html, text: message.text },
        provider.label,
      );
      break;

    case "sendgrid":
      await post(
        "https://api.sendgrid.com/v3/mail/send",
        { Authorization: `Bearer ${config.password}` },
        {
          personalizations: [
            {
              to: message.to.map((email) => ({ email })),
              ...(cc.length ? { cc: cc.map((email) => ({ email })) } : {}),
            },
          ],
          from: { email: config.fromEmail, name: config.fromName },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
        },
        provider.label,
      );
      break;

    case "brevo":
      await post(
        "https://api.brevo.com/v3/smtp/email",
        { "api-key": config.password },
        {
          sender: { email: config.fromEmail, name: config.fromName },
          to: message.to.map((email) => ({ email })),
          ...(cc.length ? { cc: cc.map((email) => ({ email })) } : {}),
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        },
        provider.label,
      );
      break;

    case "postmark":
      await post(
        "https://api.postmarkapp.com/email",
        { "X-Postmark-Server-Token": config.password, Accept: "application/json" },
        {
          From: from,
          To: message.to.join(","),
          ...(cc.length ? { Cc: cc.join(",") } : {}),
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: message.text,
          MessageStream: "outbound",
        },
        provider.label,
      );
      break;

    case "mailersend":
      await post(
        "https://api.mailersend.com/v1/email",
        { Authorization: `Bearer ${config.password}` },
        {
          from: { email: config.fromEmail, name: config.fromName },
          to: message.to.map((email) => ({ email })),
          ...(cc.length ? { cc: cc.map((email) => ({ email })) } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        provider.label,
      );
      break;

    case "mailgun": {
      const domain = config.fromEmail.split("@")[1];
      if (!domain) throw new Error("Sender email address is invalid.");
      const base = config.host.includes(".eu.") ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
      const form = new URLSearchParams({
        from,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      for (const t of message.to) form.append("to", t);
      for (const c of cc) form.append("cc", c);
      const res = await fetch(`${base}/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${config.password}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      if (!res.ok) {
        throw new Error(`Mailgun rejected the message [${res.status}]: ${(await res.text()).slice(0, 400)}`);
      }
      break;
    }

    default:
      throw new Error(`Unhandled provider ${provider.id}`);
  }

  return { provider: provider.label };
}
