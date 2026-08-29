import "server-only";

import { Resend } from "resend";

import type { EmailLogStatus } from "@/lib/types";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendEmailResult = {
  status: EmailLogStatus;
  message: string;
  providerMessageId?: string | null;
  missingEnv?: string[];
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const missingEnv = [!apiKey ? "RESEND_API_KEY" : null, !from ? "EMAIL_FROM" : null].filter(
    (value): value is string => Boolean(value)
  );

  if (!apiKey || !from) {
    return {
      status: "skipped",
      message: "Email service is not configured.",
      providerMessageId: null,
      missingEnv
    };
  }

  try {
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    });

    if (error) {
      return {
        status: "failed",
        message: error.message || "Welcome email could not be sent.",
        providerMessageId: null
      };
    }

    return {
      status: "sent",
      message: "Welcome email sent.",
      providerMessageId: data?.id ?? null
    };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Welcome email could not be sent.",
      providerMessageId: null
    };
  }
}
