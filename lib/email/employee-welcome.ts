import "server-only";

import { departmentDisplayName } from "@/lib/department-utils";
import { generateAiWelcomeEmail, renderWelcomeEmailHtml, renderWelcomeEmailText } from "@/lib/email/ai-welcome";
import { sendEmail } from "@/lib/email/send-email";
import { getWelcomeEmailTemplate } from "@/lib/email/templates";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Department, EmailLogStatus, EmailTemplate } from "@/lib/types";

type WelcomeEmailInput = {
  employeeId: string;
  employeeName: string;
  email: string;
  designation: string | null;
  employeeType?: string | null;
  responsibilities?: string | null;
  departments: Department[];
  otherDepartmentText: string | null;
};

type EmailResult = {
  status: EmailLogStatus;
  message: string;
  providerMessageId?: string | null;
};

export async function sendEmployeeWelcomeEmail(input: WelcomeEmailInput): Promise<EmailResult> {
  const template = await getWelcomeEmailTemplate();
  const organizationSettings = await getOrganizationSettings();
  const setupLink = await createSetupLink(input.email);

  if (!setupLink) {
    const failedMessage = "A secure setup link could not be generated for the welcome email.";
    await logEmailAttempt(input, template, "Secure setup link unavailable", "failed", failedMessage, null, {
      setup_link_generated: false,
      ai_generation_failed: true,
      reason: "missing_setup_link"
    });
    return { status: "failed", message: failedMessage };
  }

  const aiInput = {
    employeeName: input.employeeName,
    designation: input.designation ?? null,
    employeeType: input.employeeType ?? null,
    responsibilities: input.responsibilities ?? null,
    departments: departmentNames(input.departments, input.otherDepartmentText),
    organizationName: organizationSettings?.organization_name || "Organization",
    contactEmail: template.contact_email ?? null,
    contactPhone: template.contact_phone ?? null,
    contactAddress: template.contact_address ?? null
  };

  const aiResult = await generateAiWelcomeEmail(aiInput);

  if (!aiResult.ok) {
    await logEmailAttempt(input, template, "AI welcome email generation failed", "failed", aiResult.message, null, {
      setup_link_generated: true,
      ai_generation_failed: true,
      ai_generation_reason: aiResult.reason,
      ai_error_message: aiResult.message
    });
    return {
      status: "failed",
      message: `AI welcome email generation failed: ${aiResult.message}`
    };
  }

  const html = renderWelcomeEmailHtml(aiResult.content, setupLink, organizationSettings?.organization_name || "Organization");
  const plainText = renderWelcomeEmailText(aiResult.content, setupLink, organizationSettings?.organization_name || "Organization");

  const result = await sendEmail({
    to: input.email,
    subject: aiResult.content.subject,
    text: plainText,
    html
  });

  await logEmailAttempt(
    input,
    template,
    aiResult.content.subject,
    result.status,
    result.status === "sent" ? null : result.message,
    result.providerMessageId ?? null,
    {
      missing_env: result.missingEnv ?? [],
      setup_link_generated: true,
      ai_generation_used: true,
      ai_model: aiResult.model
    }
  );

  return {
    status: result.status,
    message: result.message,
    providerMessageId: result.providerMessageId ?? null
  };
}

function departmentNames(departments: Department[], otherDepartmentText: string | null) {
  return departments.map((department) => {
    const name = departmentDisplayName(department.name);
    return name === "Other" && otherDepartmentText ? otherDepartmentText : name;
  });
}

async function createSetupLink(email: string) {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) return null;

  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appBaseUrl.replace(/\/$/, "")}/auth/callback`
      }
    });

    if (error) return null;
    return data.properties?.action_link ?? null;
  } catch {
    return null;
  }
}

async function logEmailAttempt(
  input: WelcomeEmailInput,
  template: EmailTemplate,
  subject: string,
  status: EmailLogStatus,
  errorMessage: string | null,
  providerMessageId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    await createAdminClient().from("email_logs").insert({
      employee_id: input.employeeId,
      // Record the actual delivery recipient. If a test override is configured,
      // it will be used for delivery; this log field should reflect that actual recipient.
      recipient_email: (typeof process.env.WELCOME_EMAIL_TEST_RECIPIENT === "string" && process.env.WELCOME_EMAIL_TEST_RECIPIENT.trim())
        ? process.env.WELCOME_EMAIL_TEST_RECIPIENT.trim()
        : input.email,
      template_key: template.template_key,
      subject,
      status,
      provider: "resend",
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      metadata
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email] email log failed", error instanceof Error ? error.message : "unknown");
    }
  }
}
