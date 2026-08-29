import "server-only";

import OpenAI from "openai";

export type AiWelcomeEmailInput = {
  employeeName: string;
  designation: string | null;
  employeeType?: string | null;
  responsibilities?: string | null;
  departments?: string[] | null;
  organizationName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
};

export type AiWelcomeEmailContent = {
  subject: string;
  bodyText: string;
};

export type AiWelcomeGenerationFailureReason =
  | "missing_api_key"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "malformed_output";

export type AiWelcomeGenerationResult =
  | {
      ok: true;
      content: AiWelcomeEmailContent;
      model: string;
    }
  | {
      ok: false;
      reason: AiWelcomeGenerationFailureReason;
      message: string;
    };

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/i;
const MARKDOWN_REGEX = /(^\s*#{1,6}\s|\*\*|__|`|^\s*[-*+]\s|^\s*\d+\.\s)/m;

export async function generateAiWelcomeEmail(input: AiWelcomeEmailInput): Promise<AiWelcomeGenerationResult> {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();

  let apiKey: string | undefined;
  let model: string;

  if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY;
    model = process.env.OPENAI_WELCOME_EMAIL_MODEL || DEFAULT_MODEL;
  } else if (provider === "gemini") {
    apiKey = process.env.GEMINI_API_KEY;
    model = process.env.GEMINI_WELCOME_EMAIL_MODEL || DEFAULT_GEMINI_MODEL;
  } else {
    return {
      ok: false,
      reason: "provider_error",
      message: `Unsupported AI_PROVIDER: ${process.env.AI_PROVIDER || "(not set)"}`
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_api_key",
      message: `${provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} is not configured. AI welcome email generation was skipped.`
    };
  }

  const sanitizedInput = sanitizeAiInput(input);

  const clientOptions: Record<string, unknown> = {
    apiKey,
    timeout: 20000,
    maxRetries: 0
  };

  // For Gemini, use Google's OpenAI-compatible base URL
  if (provider === "gemini") {
    // keep this fixed per instructions
    (clientOptions as any).baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
  }

  const client = new OpenAI(clientOptions as any);

  try {
    // Prepare provider-specific request options. OpenAI keeps the existing structured
    // response hint; Gemini may not support `response_format`, so omit it for Gemini
    // and rely on the prompt + JSON.parse validation below.
    const requestPayload: any = {
      model,
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You write concise, warm, professional plain-text welcome emails. Return only valid JSON with the exact keys subject and bodyText. Do not use markdown, headings, bullets, or raw HTML. The email should read naturally in a plain email client."
        },
        {
          role: "user",
          content: buildWelcomeEmailPrompt(sanitizedInput)
        }
      ]
    };

    if (provider === "openai") {
      // preserve existing OpenAI structured-output hint when using OpenAI
      requestPayload.response_format = { type: "json_object" };
    }

    const completion = await client.chat.completions.create(requestPayload);

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) {
      return {
        ok: false,
        reason: "invalid_response",
        message: "The AI model returned no email content."
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
      // Defensive normalization: remove any trailing sign-off block if present.
      if (parsed && typeof parsed === "object" && typeof parsed.bodyText === "string") {
        parsed.bodyText = removeTrailingSignOff(String(parsed.bodyText));
      }
    } catch {
      return {
        ok: false,
        reason: "invalid_response",
        message: "The AI model returned content that was not valid JSON."
      };
    }

    const validation = validateAiWelcomeEmailContent(parsed);
    if (!validation.ok) {
      return {
        ok: false,
        reason: "malformed_output",
        message: validation.message
      };
    }

    return {
      ok: true,
      content: validation.content,
      model
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Welcome email generation failed.";

    if (/timeout|timed out|AbortError/i.test(message)) {
      return {
        ok: false,
        reason: "timeout",
        message: "AI welcome email generation timed out."
      };
    }

    return {
      ok: false,
      reason: "provider_error",
      message: `AI welcome email generation failed: ${message}`
    };
  }
}

/**
 * Remove a trailing sign-off block from the AI-generated body text.
 * Only removes a trailing block when it appears at the end of the string
 * and matches common sign-off patterns (e.g. "Warm regards,\nOrg Name").
 * This leaves natural occurrences of words like "regards" intact elsewhere.
 */
function removeTrailingSignOff(value: string): string {
  if (!value) return value;

  // Trim trailing whitespace first
  let s = value.replace(/\s+$/g, "");

  // Match trailing sign-off variants possibly in one or two lines.
  // Examples handled:
  // "Warm regards,\nBoard of Islamic Education"
  // "Best regards, Board of Islamic Education"
  // "Sincerely,\nBoard of Islamic Education"
  const signoffPattern = new RegExp(
    // optional leading newlines/spaces, then the sign-off word(s)
    "(?:\\r?\\n){0,2}\\s*(?:Warm regards|Regards|Best regards|Sincerely|Kind regards)\\s*,?\\s*(?:\\r?\\n\\s*([A-Za-z0-9 &'\\.\-]{2,100})\\s*)?$",
    "i"
  );

  if (signoffPattern.test(s)) {
    s = s.replace(signoffPattern, "").replace(/\s+$/g, "");
  }

  return s;
}

export function renderWelcomeEmailHtml(content: AiWelcomeEmailContent, setupLink: string, organizationName: string = "Organization") {
  const safeOrganizationName = escapeHtml(organizationName || "Organization");
  const safeSetupLink = sanitizeSetupLink(setupLink);

  const safeBody = content.bodyText
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim().replace(/\s+/g, " "))}</p>`)
    .join("");

  const accountSetupHtml = safeSetupLink
    ? `<p><strong>Account setup:</strong> <a href="${escapeHtmlAttribute(safeSetupLink)}" target="_blank" rel="noopener noreferrer">Set up your account</a></p>`
    : "<p><strong>Account setup:</strong> Please follow the secure setup instructions provided to you.</p>";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto;">
      ${safeBody}
      ${accountSetupHtml}
      <p>Warm regards,<br />${safeOrganizationName}</p>
    </div>
  `.trim();
}

export function renderWelcomeEmailText(content: AiWelcomeEmailContent, setupLink: string, organizationName: string = "Organization") {
  const safeOrg = normalizeText(organizationName) || "Organization";
  const body = content.bodyText.replace(/\r\n/g, "\n").trim();

  const lines = [body, "", "Account setup", "To set up your secure account password, use the link below:", setupLink, "", `Warm regards,`, safeOrg];
  return lines.filter((l) => l !== undefined).join("\n\n");
}

function sanitizeAiInput(input: AiWelcomeEmailInput): AiWelcomeEmailInput {
  const departments = Array.isArray(input.departments)
    ? Array.from(new Set(input.departments.map((department) => normalizeText(department)).filter(Boolean)))
    : [];

  return {
    employeeName: normalizeText(input.employeeName),
    designation: normalizeText(input.designation),
    employeeType: normalizeText(input.employeeType),
    responsibilities: normalizeText(input.responsibilities),
    departments,
    organizationName: normalizeText(input.organizationName) || "Organization",
    contactEmail: normalizeText(input.contactEmail),
    contactPhone: normalizeText(input.contactPhone),
    contactAddress: normalizeText(input.contactAddress)
  };
}

function buildWelcomeEmailPrompt(input: AiWelcomeEmailInput) {
  const departments = input.departments && input.departments.length > 0 ? input.departments.join(", ") : "Not provided";
  const responsibilities = input.responsibilities || "Not provided";
  const organizationName = input.organizationName || "Organization";
  const designation = input.designation || "Not provided";
  const employeeType = input.employeeType || "Not provided";
  const contactEmail = input.contactEmail || "Not provided";
  const contactPhone = input.contactPhone || "Not provided";
  const contactAddress = input.contactAddress || "Not provided";
  return `
You are creating a professional welcome email for a new employee.

Employee data:
- Employee name: ${input.employeeName || "Not provided"}
- Designation: ${designation}
- Employee type: ${employeeType}
- Departments: ${departments}
- Responsibilities: ${responsibilities}
- Organization: ${organizationName}
- Contact email: ${contactEmail}
- Contact phone: ${contactPhone}
- Contact address: ${contactAddress}
- The application will add a secure account setup section and link separately. Do not mention, create, invent, or include any URL in your generated subject or body text.

Important sign-off rules:
- Do NOT include any closing or sign-off in the generated body text.
- Do NOT include phrases such as: "Warm regards", "Regards", "Best regards", "Sincerely", "Kind regards", or similar closing lines.
- Do NOT append the organization name as a signature. The application will add the final sign-off itself.

Requirements:
- Write a brief, warm, professional plain-text email intended for an email client.
- Greet the employee naturally and welcome them to the organization.
- Acknowledge their designation, department(s), and role context.
- Briefly reflect the actual responsibilities provided.
- Explain that their contribution is valued and appreciated.
- Keep it concise and not repetitive.
- Do not invent responsibilities, achievements, qualifications, years of experience, or personal facts.
- Do not include markdown, headings, bullet points, or HTML.
- Do not include any URL or setup link in the generated email body text.
- Use only the provided facts and write in a natural tone.
- Return only valid JSON in the format {"subject": "...", "bodyText": "..."}.
`;
}

function validateAiWelcomeEmailContent(value: unknown): { ok: true; content: AiWelcomeEmailContent } | { ok: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "The AI response was not a JSON object." };
  }

  const record = value as Record<string, unknown>;
  const subject = normalizeText(typeof record.subject === "string" ? record.subject : "");
  const bodyText = typeof record.bodyText === "string" ? record.bodyText.trim() : "";

  if (!subject) {
    return { ok: false, message: "The AI subject was empty." };
  }

  if (!bodyText) {
    return { ok: false, message: "The AI message body was empty." };
  }

  if (subject.length < 8 || subject.length > 200) {
    return { ok: false, message: "The AI subject was not in a reasonable size range." };
  }

  if (bodyText.length < 80 || bodyText.length > 2500) {
    return { ok: false, message: "The AI body text was not in a reasonable size range." };
  }

  if (containsMarkdown(subject) || containsMarkdown(bodyText)) {
    return { ok: false, message: "The AI output used markdown formatting, which is not allowed." };
  }

  if (containsUrl(subject) || containsUrl(bodyText) || bodyText.includes("{{") || bodyText.includes("}}")) {
    return { ok: false, message: "The AI output contained a fabricated or unsafe link or template token." };
  }

    // Do not allow any URLs in the AI output; the application will add the secure setup link itself.
    // The AI no longer receives the raw setup link.

  return {
    ok: true,
    content: {
      subject,
      bodyText: bodyText.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim()
    }
  };
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sanitizeSetupLink(value: string) {
  const cleaned = normalizeText(value);
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) return "";
  return cleaned;
}

function containsUrl(value: string) {
  return URL_REGEX.test(value);
}

function containsMarkdown(value: string) {
  return MARKDOWN_REGEX.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/\n/g, " ");
}
