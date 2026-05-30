<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: text/plain; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo 'METHOD_NOT_ALLOWED'; exit; }

$SMTP_HOST    = 'smtp.gmail.com';
$SMTP_PORT    = 587;
$SMTP_USER    = 'wordpressdeveloper777@gmail.com';
$SMTP_PASS    = 'ylekxnfiimmftkla';
$MAIL_TO      = 'info@etisora.ai';
$MAIL_SUBJECT = 'New Lead — Etisora Contact Form';

require __DIR__ . '/PHPMailer/src/Exception.php';
require __DIR__ . '/PHPMailer/src/PHPMailer.php';
require __DIR__ . '/PHPMailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function clean($val) {
    return htmlspecialchars(strip_tags(trim((string)$val)), ENT_QUOTES, 'UTF-8');
}

$name     = clean($_POST['name']     ?? '');
$email    = trim($_POST['email']     ?? '');
$phone    = clean($_POST['phone']    ?? '');
$company  = clean($_POST['company']  ?? '');
$industry = clean($_POST['industry'] ?? '');
$message  = clean($_POST['message']  ?? '');

if (empty($name) || empty($email)) { http_response_code(400); echo 'MISSING_FIELDS'; exit; }
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { http_response_code(400); echo 'INVALID_EMAIL'; exit; }

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = $SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = $SMTP_USER;
    $mail->Password   = $SMTP_PASS;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = $SMTP_PORT;
    $mail->CharSet    = 'UTF-8';

    $mail->setFrom($SMTP_USER, 'Etisora Website');
    $mail->addAddress($MAIL_TO);
    $mail->addReplyTo($email, $name);

    $mail->Subject = $MAIL_SUBJECT;
    $mail->Body =
        "New lead from etisora.ai\n" .
        "================================\n\n" .
        "Name:      $name\n" .
        "Email:     $email\n" .
        "Phone:     " . ($phone ?: 'Not provided') . "\n" .
        "Company:   " . ($company ?: 'Not provided') . "\n" .
        "Service:   " . ($industry ?: 'Not selected') . "\n\n" .
        "Message:\n----------------------------\n$message\n\n" .
        "================================\n" .
        "Submitted: " . date('Y-m-d H:i:s') . " UTC\n";

    $mail->send();
    echo 'OK';

} catch (Exception $e) {
    error_log('Etisora mailer error: ' . $mail->ErrorInfo);
    http_response_code(500);
    echo 'MAIL_FAILED';
}
?>