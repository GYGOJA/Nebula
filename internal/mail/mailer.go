package mail

import (
	"errors"
	"fmt"
	"log"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

const (
	smtpHost = "smtp.gmail.com"
	smtpPort = "587"
)

type Mailer struct {
	from     string
	password string
}

func NewMailer(from, password string) *Mailer {
	return &Mailer{from: from, password: password}
}

func (m *Mailer) SendCode(to, code string) error {
	return m.send(
		to,
		"Код подтверждения Nebula",
		fmt.Sprintf(
			"Ваш код подтверждения: %s\r\nКод действует 10 минут.\r\n\r\nЕсли вы не запрашивали код, проигнорируйте письмо.",
			code,
		),
	)
}

// SendResetCode sends the one-time code for password recovery.
func (m *Mailer) SendResetCode(to, code string) error {
	return m.send(
		to,
		"Восстановление пароля Nebula",
		fmt.Sprintf(
			"Код для восстановления пароля: %s\r\nКод действует 10 минут.\r\n\r\nЕсли вы не запрашивали восстановление, проигнорируйте письмо — ваш пароль не изменится.",
			code,
		),
	)
}

func (m *Mailer) send(to, rawSubject, body string) error {
	if strings.ContainsAny(to, "\r\n") {
		return errors.New("invalid email address")
	}

	// Development only: MAIL_LOG_ONLY=true prints the message (with the code) to the log instead of using SMTP.
	if os.Getenv("MAIL_LOG_ONLY") == "true" {
		log.Printf("[mail:log-only] to=%s subject=%q\n%s", to, rawSubject, body)
		return nil
	}

	subject := mime.QEncoding.Encode("UTF-8", rawSubject)
	msg := "From: " + m.from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body

	auth := smtp.PlainAuth("", m.from, m.password, smtpHost)
	err := smtp.SendMail(smtpHost+":"+smtpPort, auth, m.from, []string{to}, []byte(msg))
	if err != nil {
		return fmt.Errorf("send mail: %w", err)
	}
	return nil
}
