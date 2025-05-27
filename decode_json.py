import json

# The JSON string
json_str = "{\"privPronJson\":{\"Confidence\":0.9128226,\"Lexical\":\"not good\",\"ITN\":\"not good\",\"MaskedITN\":\"not good\",\"Display\":\"Not good.\",\"PronunciationAssessment\":{\"AccuracyScore\":97,\"FluencyScore\":100,\"CompletenessScore\":100,\"PronScore\":98.2},\"Words\":[{\"Word\":\"not\",\"Offset\":2400000,\"Duration\":5900000,\"PronunciationAssessment\":{\"AccuracyScore\":97,\"ErrorType\":\"None\"},\"Syllables\":[{\"Syllable\":\"nɑt\",\"Grapheme\":\"not\",\"PronunciationAssessment\":{\"AccuracyScore\":99},\"Offset\":2400000,\"Duration\":5900000}],\"Phonemes\":[{\"Phoneme\":\"n\",\"PronunciationAssessment\":{\"AccuracyScore\":100,\"NBestPhonemes\":[{\"Phoneme\":\"n\",\"Score\":100},{\"Phoneme\":\"m\",\"Score\":11},{\"Phoneme\":\"oʊ\",\"Score\":9}]},\"Offset\":2400000,\"Duration\":3500000},{\"Phoneme\":\"ɑ\",\"PronunciationAssessment\":{\"AccuracyScore\":91,\"NBestPhonemes\":[{\"Phoneme\":\"ɑ\",\"Score\":100},{\"Phoneme\":\"ʌ\",\"Score\":9},{\"Phoneme\":\"n\",\"Score\":8}]},\"Offset\":6000000,\"Duration\":500000},{\"Phoneme\":\"t\",\"PronunciationAssessment\":{\"AccuracyScore\":100,\"NBestPhonemes\":[{\"Phoneme\":\"t\",\"Score\":100},{\"Phoneme\":\"ɡ\",\"Score\":46},{\"Phoneme\":\"ɑ\",\"Score\":16}]},\"Offset\":6600000,\"Duration\":1700000}]},{\"Word\":\"good\",\"Offset\":8400000,\"Duration\":6300000,\"PronunciationAssessment\":{\"AccuracyScore\":97,\"ErrorType\":\"None\"},\"Syllables\":[{\"Syllable\":\"ɡud\",\"Grapheme\":\"good\",\"PronunciationAssessment\":{\"AccuracyScore\":88},\"Offset\":8400000,\"Duration\":6300000}],\"Phonemes\":[{\"Phoneme\":\"ɡ\",\"PronunciationAssessment\":{\"AccuracyScore\":100,\"NBestPhonemes\":[{\"Phoneme\":\"ɡ\",\"Score\":100},{\"Phoneme\":\"t\",\"Score\":45},{\"Phoneme\":\"u\",\"Score\":2}]},\"Offset\":8400000,\"Duration\":700000},{\"Phoneme\":\"u\",\"PronunciationAssessment\":{\"AccuracyScore\":100,\"NBestPhonemes\":[{\"Phoneme\":\"u\",\"Score\":100},{\"Phoneme\":\"d\",\"Score\":62},{\"Phoneme\":\"ɡ\",\"Score\":24}]},\"Offset\":9200000,\"Duration\":1300000},{\"Phoneme\":\"d\",\"PronunciationAssessment\":{\"AccuracyScore\":81,\"NBestPhonemes\":[{\"Phoneme\":\"d\",\"Score\":100},{\"Phoneme\":\"t\",\"Score\":32},{\"Phoneme\":\"oʊ\",\"Score\":31}]},\"Offset\":10600000,\"Duration\":4100000}]}]}}"

# Parse the JSON string
data = json.loads(json_str)

# Pretty print the JSON with proper indentation
print(json.dumps(data, indent=2))

# Print some key information in a more readable format
print("\nKey Information:")
print(f"Overall Confidence: {data['privPronJson']['Confidence']}")
print(f"Display Text: {data['privPronJson']['Display']}")
print("\nPronunciation Scores:")
print(f"Accuracy: {data['privPronJson']['PronunciationAssessment']['AccuracyScore']}")
print(f"Fluency: {data['privPronJson']['PronunciationAssessment']['FluencyScore']}")
print(f"Completeness: {data['privPronJson']['PronunciationAssessment']['CompletenessScore']}")
print(f"Overall Pronunciation: {data['privPronJson']['PronunciationAssessment']['PronScore']}")

print("\nWord-by-Word Analysis:")
for word in data['privPronJson']['Words']:
    print(f"\nWord: {word['Word']}")
    print(f"Accuracy Score: {word['PronunciationAssessment']['AccuracyScore']}")
    print(f"Duration: {word['Duration']/1000000:.2f} seconds")
    print("Phonemes:")
    for phoneme in word['Phonemes']:
        print(f"  - {phoneme['Phoneme']} (Score: {phoneme['PronunciationAssessment']['AccuracyScore']})") 