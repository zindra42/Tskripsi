<?php
// Offline only: load one arithmetic class. No Laravel bootstrap, autoload, env or DB.
if ($argc !== 2) { fwrite(STDERR, "Usage: php legacy-sidang-oracle.php <Laravel-root>\n"); exit(1); }
function config(string $key, mixed $default = null): mixed { return $default; }
require $argv[1] . '/app/Services/KalkulasiNilaiSidangService.php';
$requests = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$results = [];
foreach ($requests as $request) {
    if ($request['kind'] === 'form') {
        $result = App\Services\KalkulasiNilaiSidangService::hitungNilaiForm($request['role'], $request['values']);
        $results[] = number_format($result['nilai_akhir'], 2, '.', '');
    } else {
        $result = App\Services\KalkulasiNilaiSidangService::hitungRekap(...$request['values']);
        $results[] = [number_format($result['nilai_akhir'], 2, '.', ''), $result['predikat']['huruf']];
    }
}
echo json_encode($results, JSON_THROW_ON_ERROR), "\n";
