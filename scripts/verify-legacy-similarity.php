<?php
// Read-only oracle: no Laravel bootstrap, environment, database, seed or application writes.
// php scripts/verify-legacy-similarity.php <Laravel root> <Sastrawi 1.2.0 source root>
if ($argc !== 3) {
    fwrite(STDERR, "Usage: php scripts/verify-legacy-similarity.php <Laravel root> <Sastrawi source root>\n");
    exit(1);
}
[$script, $laravel, $sastrawi] = $argv;
function readJson(string $path): array {
    $contents = file_get_contents($path);
    if ($contents === false) throw new RuntimeException('Cannot read ' . $path);
    $data = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
    if (!is_array($data)) throw new RuntimeException('Expected JSON array or object');
    return $data;
}
$lock = readJson($laravel . '/composer.lock');
$package = array_values(array_filter($lock['packages'], fn ($p) => $p['name'] === 'sastrawi/sastrawi'))[0];
if ($package['source']['reference'] !== '31fd4261dd4980cc57447f44d1aec4bd69e2abec') {
    throw new RuntimeException('Unexpected Sastrawi reference in composer.lock');
}
spl_autoload_register(function ($class) use ($sastrawi) {
    if (str_starts_with($class, 'Sastrawi\\')) {
        require $sastrawi . '/src/' . str_replace('\\', '/', $class) . '.php';
    }
});
require $laravel . '/app/Services/JudulSimilarityService.php';
$stemmer = new Sastrawi\Stemmer\StemmerFactory()->createStemmer();
$tokens = readJson(__DIR__ . '/../tests/fixtures/legacy-corpus-stems.json');
foreach ($tokens as $word => $expected) {
    if ($stemmer->stem((string) $word) !== $expected) {
        throw new RuntimeException('Stem fixture mismatch: ' . $word);
    }
}
$pairs = [
    ['Rancang Bangun Sistem Informasi Pendaftaran Seminar Berbasis Web', 'Rancang Bangun Sistem Informasi Pendaftaran Seminar Berbasis Web'],
    ['Pengembangan Sistem Informasi Akademik Mahasiswa', 'Sistem Informasi Akademik Berbasis Web'],
    ['Prediksi Penyakit Tanaman Menggunakan Jaringan Saraf', 'Sistem Informasi Pendaftaran Seminar'],
    ['dan di ke untuk', 'pada yang oleh dalam'],
    ['', ''],
];
$results = array_map(function ($pair) {
    $left = App\Services\JudulSimilarityService::preprocess($pair[0]);
    $right = App\Services\JudulSimilarityService::preprocess($pair[1]);
    return ['titles' => $pair, 'tokens' => [$left, $right], 'score' => App\Services\JudulSimilarityService::jaccardSimilarity($left, $right)];
}, $pairs);
echo json_encode(['verifiedTokens' => count($tokens), 'pairs' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), "\n";
