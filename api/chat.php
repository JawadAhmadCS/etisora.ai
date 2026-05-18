<?php
declare(strict_types=1);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo json_encode(['error' => ['message' => 'Method not allowed']]);
    exit;
}

function read_env_file(string $path): array {
    if (!is_file($path) || !is_readable($path)) {
        return [];
    }
    $vars = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return [];
    }
    foreach ($lines as $line) {
        $trim = trim($line);
        if ($trim === '' || strpos($trim, '#') === 0) {
            continue;
        }
        $parts = explode('=', $trim, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $key = trim($parts[0]);
        $value = trim($parts[1]);
        $value = trim($value, "\"'");
        $vars[$key] = $value;
    }
    return $vars;
}

$envVars = read_env_file(dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env');
$apiKey = getenv('GROQ_API_KEY');
if ($apiKey === false || $apiKey === '') {
    $apiKey = $envVars['GROQ_API_KEY'] ?? '';
}

if ($apiKey === '') {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'Server missing GROQ_API_KEY env var']]);
    exit;
}

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody ?: '{}', true);
if (!is_array($body)) {
    $body = [];
}

$model = (isset($body['model']) && is_string($body['model']) && $body['model'] !== '')
    ? $body['model']
    : (($envVars['GROQ_MODEL'] ?? '') !== '' ? $envVars['GROQ_MODEL'] : 'llama-3.3-70b-versatile');
$messages = (isset($body['messages']) && is_array($body['messages'])) ? $body['messages'] : [];
$temperature = (isset($body['temperature']) && is_numeric($body['temperature'])) ? (float)$body['temperature'] : 0.6;
$maxTokens = (isset($body['max_tokens']) && is_numeric($body['max_tokens'])) ? (int)$body['max_tokens'] : 300;

$payload = json_encode([
    'model' => $model,
    'messages' => $messages,
    'temperature' => $temperature,
    'max_tokens' => $maxTokens
]);

if ($payload === false) {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'Failed to encode request payload']]);
    exit;
}

if (function_exists('curl_init')) {
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_TIMEOUT, 45);

    $responseBody = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($responseBody === false) {
        http_response_code(502);
        echo json_encode(['error' => ['message' => $curlError !== '' ? $curlError : 'Upstream request failed']]);
        exit;
    }
} else {
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer " . $apiKey . "\r\n",
            'content' => $payload,
            'timeout' => 45,
            'ignore_errors' => true
        ]
    ]);
    $responseBody = @file_get_contents('https://api.groq.com/openai/v1/chat/completions', false, $context);
    if ($responseBody === false) {
        http_response_code(502);
        echo json_encode(['error' => ['message' => 'Upstream request failed']]);
        exit;
    }
    $httpCode = 200;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $headerLine) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', $headerLine, $matches) === 1) {
                $httpCode = (int)$matches[1];
                break;
            }
        }
    }
}

if ($httpCode <= 0) {
    $httpCode = 502;
}
http_response_code($httpCode);
echo $responseBody;
