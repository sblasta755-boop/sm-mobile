require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RoomScan'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.homepage       = 'https://github.com/soma360/smart-clean'
  s.author         = 'Soma360'
  # RoomPlan (RoomCaptureView/RoomCaptureSession) requires iOS 16+ - see
  # RoomScanModule.swift's isSupported() check, which additionally gates
  # on the A12-chip-or-later hardware requirement RoomCaptureSession.
  # isSupported already encodes.
  s.platforms      = {
    :ios => '16.0'
  }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'RoomPlan'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
