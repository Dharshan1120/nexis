Add-Type -AssemblyName System.Speech

$culture = [System.Globalization.CultureInfo]::GetCultureInfo("en-US")
$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)

$commands = @(
    "open chrome",
    "open youtube",
    "open notepad",
    "pause mic",
    "stop listening",
    "turn off listening",
    "turn off mic",
    "start mic"
)

$choices = New-Object System.Speech.Recognition.Choices
$choices.Add($commands)
$builder = New-Object System.Speech.Recognition.GrammarBuilder
$builder.Culture = $culture
$builder.Append($choices)
$commandGrammar = New-Object System.Speech.Recognition.Grammar($builder)

$wakeChoices = New-Object System.Speech.Recognition.Choices
$wakeChoices.Add(@("nexis", "nexus"))
$wakeBuilder = New-Object System.Speech.Recognition.GrammarBuilder
$wakeBuilder.Culture = $culture
$wakeBuilder.Append($wakeChoices)
$wakeBuilder.Append($choices)
$wakeGrammar = New-Object System.Speech.Recognition.Grammar($wakeBuilder)

$recognizer.LoadGrammar($commandGrammar)
$recognizer.LoadGrammar($wakeGrammar)
$dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
$recognizer.LoadGrammar($dictationGrammar)
$recognizer.SetInputToDefaultAudioDevice()
$recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(2)
$recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(2)
$recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
$recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1)

function Write-JsonLine {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Payload
    )

    ($Payload | ConvertTo-Json -Compress) | Write-Output
    [Console]::Out.Flush()
}

Write-JsonLine @{
    type = "ready"
    recognizer = "windows-speech"
}

try {
    while ($true) {
        Write-JsonLine @{
            type = "audio-state"
            state = "Listening"
        }

        $result = $recognizer.Recognize([TimeSpan]::FromSeconds(10))

        if ($null -eq $result) {
            continue
        }

        $text = $result.Text
        if ([string]::IsNullOrWhiteSpace($text)) {
            continue
        }

        $normalized = $text.ToLowerInvariant()
        if ($normalized.StartsWith("nexis ")) {
            $text = $text.Substring(6)
        }
        elseif ($normalized.StartsWith("nexus ")) {
            $text = $text.Substring(6)
        }

        $text = $text.Trim()
        if ([string]::IsNullOrWhiteSpace($text)) {
            continue
        }

        Write-JsonLine @{
            type = "final"
            text = $text
            confidence = [Math]::Round($result.Confidence, 3)
        }
    }
}
catch {
    Write-JsonLine @{
        type = "error"
        message = $_.Exception.Message
    }
    exit 1
}
finally {
    $recognizer.Dispose()
}
