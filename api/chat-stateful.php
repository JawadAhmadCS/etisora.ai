<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo json_encode(['error' => ['message' => 'Method not allowed']]);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function json_response(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

function norm(string $value): string {
    return strtolower(trim($value));
}

function match_choice(string $input, array $map): ?string {
    $key = norm($input);
    if ($key === '') {
        return null;
    }

    if (preg_match('/^\[?\s*([1-9])\s*\]?(?:[\).\-\s]|$)/', $key, $m) === 1) {
        $digit = $m[1];
        if (isset($map[$digit])) {
            return $map[$digit];
        }
    }

    return $map[$key] ?? null;
}

function is_valid_email(string $value): bool {
    return (bool)preg_match('/^[a-z0-9][a-z0-9._%+\-]{0,63}@[a-z0-9.-]+\.[a-z]{2,}$/i', trim($value));
}

function is_likely_phone(string $value): bool {
    $raw = trim($value);
    if ($raw === '' || preg_match('/^[+()\-\s0-9]+$/', $raw) !== 1) {
        return false;
    }

    $digits = preg_replace('/\D+/', '', $raw);
    $len = strlen($digits);
    return $len >= 7 && $len <= 15;
}

function is_likely_name(string $value): bool {
    $raw = trim($value);
    if ($raw === '' || strlen($raw) < 2 || strlen($raw) > 50) {
        return false;
    }

    if (preg_match('/[@\d]/', $raw) === 1) {
        return false;
    }

    if (preg_match('/^[a-zA-Z][a-zA-Z\s\'.\-]*$/', $raw) !== 1) {
        return false;
    }

    $parts = preg_split('/\s+/', $raw);
    return is_array($parts) && count($parts) <= 4;
}

function is_meaningful_description(string $value): bool {
    $raw = trim($value);
    if (strlen($raw) < 5) {
        return false;
    }

    $words = preg_split('/\s+/', $raw);
    if (!is_array($words)) {
        return false;
    }
    $nonEmptyWords = array_filter($words, static function ($word) {
        return $word !== '';
    });
    return count($nonEmptyWords) >= 3;
}

function create_session_data(): array {
    return [
        'state' => 'GREETING',
        'customerType' => null,
        'industry' => null,
        'painPoint' => null,
        'timeline' => null,
        'supportType' => null,
        'name' => null,
        'email' => null,
        'phone' => null,
        'description' => null,
        'preferredTime' => null,
        'contactMethod' => null,
        'emailSkipped' => false,
    ];
}

function reset_session_data(array &$s): void {
    $s = create_session_data();
}

$MSG = [
    'greeting' => "Hi there! Welcome to Etisora.\n\nTo connect you with the right person, are you:\n  [1] New to Etisora\n  [2] An existing client",
    'a_industry' => "Great, welcome! Which best describes your business?\n  [1] Professional services\n  [2] Trades and home services\n  [3] Retail and ecommerce\n  [4] Hospitality\n  [5] Healthcare\n  [6] Other",
    'a_pain' => "What's the biggest challenge right now?\n  [1] Missing leads / after-hours calls\n  [2] Slow lead follow-up\n  [3] Repetitive manual tasks\n  [4] Not sure yet, just exploring",
    'a_timeline' => "Are you ready to move?\n  [1] Ready in next 30 days\n  [2] Researching options\n  [3] Just browsing",
    'b_purpose' => "How can we help today?\n  [1] Technical support\n  [2] Explore additional services\n  [3] Billing or account question\n  [4] Something else",
    'b_tech' => "Please briefly describe the issue and our technical team will follow up.",
    'b_services' => "Great choice. We can help with AI voice agents, ads, WhatsApp automation, and full journey mapping.",
    'global' => "Etisora supports clients globally and our team is available 24/7.\n\nLet me capture quick details:",
    'capture_name' => "What's your name?",
    'capture_email' => "Best email to reach you? (type 'skip' if you prefer phone/WhatsApp only)",
    'capture_phone' => "Phone number? (press Enter to skip)",
    'capture_desc' => "In one sentence, what do you need help with?",
    'capture_time' => "Best time to reach you? (press Enter to skip)",
    'capture_method' => "Preferred contact method?\n  [1] Email\n  [2] Phone call\n  [3] WhatsApp",
    'invalid_name' => "Please enter a valid name (example: Jawad Khan).",
    'invalid_email' => "Please enter a valid email (example: name@example.com), or type 'skip'.",
    'phone_required' => "Since email is skipped, please enter a valid phone/WhatsApp number.",
    'invalid_phone' => "Please enter a valid phone number, or leave blank to skip.",
    'invalid_desc' => "Please share a short one-sentence summary so we can route you correctly.",
    'invalid_method' => "Please choose contact method:\n  [1] Email\n  [2] Phone call\n  [3] WhatsApp",
    'confirm' => "Perfect, %s. Your inquiry has been sent to our %s team. We'll contact you within 24 hours.\n\nAnything else? (type 'pricing', 'services', or 'done')",
    'done' => "Thanks for reaching out to Etisora. Have a great day!",
    'fallback' => "Please choose one option so I can route you correctly.",
];

$MAP = [
    'customerType' => [
        '1' => 'new', 'new' => 'new', 'new to etisora' => 'new',
        '2' => 'existing', 'existing' => 'existing', 'existing client' => 'existing',
    ],
    'industry' => [
        '1' => 'Professional services', '2' => 'Trades and home services', '3' => 'Retail and ecommerce',
        '4' => 'Hospitality', '5' => 'Healthcare', '6' => 'Other',
        'professional' => 'Professional services', 'trades' => 'Trades and home services',
        'retail' => 'Retail and ecommerce', 'hospitality' => 'Hospitality',
        'healthcare' => 'Healthcare', 'other' => 'Other',
    ],
    'pain' => [
        '1' => 'Missing leads / after-hours calls', '2' => 'Slow lead follow-up',
        '3' => 'Repetitive manual tasks', '4' => 'Not sure yet, just exploring',
    ],
    'timeline' => [
        '1' => 'Ready in next 30 days', '2' => 'Researching options', '3' => 'Just browsing',
        'ready' => 'Ready in next 30 days', 'researching' => 'Researching options', 'browsing' => 'Just browsing',
    ],
    'purpose' => [
        '1' => 'tech_support', '2' => 'new_services', '3' => 'billing', '4' => 'other',
        'tech' => 'tech_support', 'support' => 'tech_support',
        'services' => 'new_services', 'billing' => 'billing', 'other' => 'other',
    ],
    'contactMethod' => [
        '1' => 'Email', '2' => 'Phone', '3' => 'WhatsApp',
        'email' => 'Email', 'phone' => 'Phone', 'call' => 'Phone',
        'whatsapp' => 'WhatsApp', 'wa' => 'WhatsApp',
    ],
];

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody ?: '{}', true);
if (!is_array($body)) {
    $body = [];
}

$sessionId = isset($body['sessionId']) && is_string($body['sessionId']) ? trim($body['sessionId']) : '';
$message = isset($body['message']) && is_string($body['message']) ? trim($body['message']) : '';

if ($sessionId === '') {
    json_response(400, ['error' => ['message' => 'sessionId is required']]);
}

if (!isset($_SESSION['etisora_chat_sessions']) || !is_array($_SESSION['etisora_chat_sessions'])) {
    $_SESSION['etisora_chat_sessions'] = [];
}
if (!isset($_SESSION['etisora_chat_sessions'][$sessionId]) || !is_array($_SESSION['etisora_chat_sessions'][$sessionId])) {
    $_SESSION['etisora_chat_sessions'][$sessionId] = create_session_data();
}

$session = $_SESSION['etisora_chat_sessions'][$sessionId];
$inputLc = norm($message);
$reply = $MSG['fallback'];

function contains_text(string $haystack, string $needle): bool {
    return $needle !== '' && strpos($haystack, $needle) !== false;
}

switch ($session['state']) {
    case 'GREETING':
        $type = match_choice($message, $MAP['customerType']);
        if ($type === null) {
            $reply = $MSG['fallback'] . "\n\n" . $MSG['greeting'];
            break;
        }
        $session['customerType'] = $type;
        if ($type === 'new') {
            $session['state'] = 'A_INDUSTRY';
            $reply = $MSG['a_industry'];
        } else {
            $session['state'] = 'B_PURPOSE';
            $reply = $MSG['b_purpose'];
        }
        break;

    case 'A_INDUSTRY':
        $val = match_choice($message, $MAP['industry']);
        if ($val === null) {
            $reply = $MSG['a_industry'];
            break;
        }
        $session['industry'] = $val;
        $session['state'] = 'A_PAIN';
        $reply = $MSG['a_pain'];
        break;

    case 'A_PAIN':
        $val = match_choice($message, $MAP['pain']);
        if ($val === null) {
            $reply = $MSG['a_pain'];
            break;
        }
        $session['painPoint'] = $val;
        $session['state'] = 'A_TIMELINE';
        $reply = $MSG['a_timeline'];
        break;

    case 'A_TIMELINE':
        $val = match_choice($message, $MAP['timeline']);
        if ($val === null) {
            $reply = $MSG['a_timeline'];
            break;
        }
        $session['timeline'] = $val;
        $session['state'] = 'GLOBAL';
        $reply = $MSG['global'] . "\n\n" . $MSG['capture_name'];
        break;

    case 'B_PURPOSE':
        $val = match_choice($message, $MAP['purpose']);
        if ($val === null) {
            $reply = $MSG['b_purpose'];
            break;
        }
        $session['supportType'] = $val;
        if ($val === 'tech_support') {
            $session['state'] = 'B_TECH';
            $reply = $MSG['b_tech'];
        } elseif ($val === 'new_services') {
            $session['state'] = 'GLOBAL';
            $reply = $MSG['b_services'] . "\n\n" . $MSG['global'] . "\n\n" . $MSG['capture_name'];
        } else {
            $session['state'] = 'GLOBAL';
            $reply = $MSG['global'] . "\n\n" . $MSG['capture_name'];
        }
        break;

    case 'B_TECH':
        if ($message !== '') {
            $session['description'] = $message;
        }
        $session['state'] = 'GLOBAL';
        $reply = $MSG['global'] . "\n\n" . $MSG['capture_name'];
        break;

    case 'GLOBAL':
        $session['state'] = 'CAPTURE_NAME';
        if ($message !== '') {
            // If user already typed their name in the same turn, continue validation.
            if (!is_likely_name($message)) {
                $reply = $MSG['invalid_name'];
                break;
            }
            $session['name'] = $message;
            $session['state'] = 'CAPTURE_EMAIL';
            $reply = $MSG['capture_email'];
            break;
        }
        $reply = $MSG['capture_name'];
        break;

    case 'CAPTURE_NAME':
        if (!is_likely_name($message)) {
            $reply = $MSG['invalid_name'];
            break;
        }
        $session['name'] = $message;
        $session['state'] = 'CAPTURE_EMAIL';
        $reply = $MSG['capture_email'];
        break;

    case 'CAPTURE_EMAIL':
        if ($inputLc === 'skip') {
            $session['email'] = null;
            $session['emailSkipped'] = true;
            $session['state'] = 'CAPTURE_PHONE';
            $reply = $MSG['phone_required'];
            break;
        }
        if (!is_valid_email($message)) {
            $reply = $MSG['invalid_email'];
            break;
        }
        $session['email'] = strtolower($message);
        $session['emailSkipped'] = false;
        $session['state'] = 'CAPTURE_PHONE';
        $reply = $MSG['capture_phone'];
        break;

    case 'CAPTURE_PHONE':
        if ($session['emailSkipped'] === true) {
            if (!is_likely_phone($message)) {
                $reply = $MSG['phone_required'];
                break;
            }
            $session['phone'] = $message;
        } else {
            if ($message !== '' && !is_likely_phone($message)) {
                $reply = $MSG['invalid_phone'];
                break;
            }
            $session['phone'] = $message !== '' ? $message : null;
        }
        $session['state'] = 'CAPTURE_DESC';
        $reply = $MSG['capture_desc'];
        break;

    case 'CAPTURE_DESC':
        if (!is_meaningful_description($message)) {
            $reply = $MSG['invalid_desc'];
            break;
        }
        if ($session['description'] === null || trim((string)$session['description']) === '') {
            $session['description'] = $message;
        }
        $session['state'] = 'CAPTURE_TIME';
        $reply = $MSG['capture_time'];
        break;

    case 'CAPTURE_TIME':
        $session['preferredTime'] = $message !== '' ? $message : null;
        $session['state'] = 'CAPTURE_METHOD';
        $reply = $MSG['capture_method'];
        break;

    case 'CAPTURE_METHOD':
        $val = match_choice($message, $MAP['contactMethod']);
        if ($val === null) {
            $reply = $MSG['invalid_method'];
            break;
        }
        $session['contactMethod'] = $val;
        $session['state'] = 'CONFIRM';
        $dept = ($session['supportType'] === 'tech_support') ? 'Technical Support' : 'Sales';
        $reply = sprintf($MSG['confirm'], $session['name'] ?? 'there', $dept);
        break;

    case 'CONFIRM':
        if (contains_text($inputLc, 'pricing')) {
            $reply = "Our pricing starts from USD 997/month for Starter and USD 2497/month for Growth. Full details are available at etisora.ai/#pricing\n\nAnything else? (type 'done' to finish)";
            break;
        }
        if (contains_text($inputLc, 'service')) {
            $reply = "We offer AI chatbots, voice agents, lead generation, paid ads, WhatsApp automation, and customer journey mapping.\n\nAnything else? (type 'done' to finish)";
            break;
        }
        $session['state'] = 'DONE';
        $reply = $MSG['done'];
        break;

    case 'DONE':
        if (in_array($inputLc, ['done', 'bye', 'goodbye', 'exit', 'quit', 'stop'], true)) {
            $reply = $MSG['done'];
            break;
        }
        reset_session_data($session);
        $reply = $MSG['greeting'];
        break;

    default:
        reset_session_data($session);
        $reply = $MSG['greeting'];
        break;
}

$_SESSION['etisora_chat_sessions'][$sessionId] = $session;

json_response(200, [
    'reply' => $reply,
    'state' => $session['state'],
    'done' => $session['state'] === 'DONE',
    'greeting' => $MSG['greeting'],
]);
