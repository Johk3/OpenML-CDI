from dataclasses import dataclass, field
from email.message import EmailMessage
import smtplib
from typing import Protocol

from app.config import Settings


class EmailDeliveryError(RuntimeError):
    pass


class EmailSender(Protocol):
    def send_verification_email(
        self, *, to_email: str, verification_url: str
    ) -> None: ...


@dataclass(frozen=True)
class SentEmail:
    to_email: str
    verification_url: str


@dataclass
class InMemoryEmailSender:
    sent_messages: list[SentEmail] = field(default_factory=list)

    def send_verification_email(self, *, to_email: str, verification_url: str) -> None:
        self.sent_messages.append(
            SentEmail(to_email=to_email, verification_url=verification_url)
        )


@dataclass(frozen=True)
class ConsoleEmailSender:
    from_email: str

    def send_verification_email(self, *, to_email: str, verification_url: str) -> None:
        print(
            f"Verification email from {self.from_email} to {to_email}: "
            f"{verification_url}"
        )


@dataclass(frozen=True)
class SMTPEmailSender:
    host: str
    port: int
    username: str
    password: str
    use_tls: bool
    from_email: str

    def send_verification_email(self, *, to_email: str, verification_url: str) -> None:
        message = EmailMessage()
        message["From"] = self.from_email
        message["To"] = to_email
        message["Subject"] = "Verify your account"
        message.set_content(
            "Welcome. Verify your account by opening this link:\n" f"{verification_url}"
        )

        try:
            with smtplib.SMTP(self.host, self.port) as smtp:
                if self.use_tls:
                    smtp.starttls()
                if self.username:
                    smtp.login(self.username, self.password)
                smtp.send_message(message)
        except OSError as exc:
            raise EmailDeliveryError("Failed to send verification email") from exc


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.email.backend == "smtp":
        return SMTPEmailSender(
            host=settings.email.smtp_host,
            port=settings.email.smtp_port,
            username=settings.email.smtp_username,
            password=settings.email.smtp_password,
            use_tls=settings.email.smtp_use_tls,
            from_email=settings.email.from_email,
        )
    return ConsoleEmailSender(from_email=settings.email.from_email)
