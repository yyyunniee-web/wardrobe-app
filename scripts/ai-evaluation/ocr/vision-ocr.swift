#!/usr/bin/env swift
import Foundation
import Vision
import ImageIO
import CoreGraphics

// macOS Vision OCR helper for AI Eval Experiment B (offline eval only).
// Build: swiftc -O vision-ocr.swift -o vision-ocr

guard CommandLine.arguments.count > 1 else {
  fputs("usage: vision-ocr <imagePath>\n", stderr)
  exit(1)
}
let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("failed to load image: \(path)\n", stderr)
  exit(2)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if #available(macOS 13.0, *) {
  request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
}

let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
do {
  try handler.perform([request])
} catch {
  fputs("ocr failed: \(error)\n", stderr)
  exit(3)
}

let observations = request.results ?? []
var lines: [String] = []
for o in observations {
  if let s = o.topCandidates(1).first?.string {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    if !t.isEmpty { lines.append(t) }
  }
}
print(lines.joined(separator: "\n"))
