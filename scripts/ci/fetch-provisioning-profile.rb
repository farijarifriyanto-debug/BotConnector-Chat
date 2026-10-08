#!/usr/bin/env ruby
# frozen_string_literal: true

require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'

key_id = ENV.fetch('APP_STORE_CONNECT_API_KEY_ID')
issuer_id = ENV.fetch('APP_STORE_CONNECT_API_ISSUER_ID')
key_path = ENV['KEY_PATH'] || File.expand_path("~/.appstoreconnect/private_keys/AuthKey_#{key_id}.p8")
bundle_id = ENV['BUNDLE_ID'] || 'id.botconnector.app'

unless File.exist?(key_path)
  warn "Error: Key file not found at #{key_path}"
  exit 1
end

# 1. Generate App Store Connect JWT Token (ES256)
header = { alg: 'ES256', kid: key_id, typ: 'JWT' }
payload = { iss: issuer_id, exp: Time.now.to_i + 1200, aud: 'appstoreconnect-v1' }

def b64url(data)
  Base64.urlsafe_encode64(data, padding: false)
end

signing_input = "#{b64url(header.to_json)}.#{b64url(payload.to_json)}"

ec_key = OpenSSL::PKey::EC.new(File.read(key_path))
der_sig = ec_key.sign('SHA256', signing_input)
asn1 = OpenSSL::ASN1.decode(der_sig)
r = asn1.value[0].value.to_s(2).rjust(32, "\x00")[-32..-1]
s = asn1.value[1].value.to_s(2).rjust(32, "\x00")[-32..-1]
raw_sig = r + s
token = "#{signing_input}.#{b64url(raw_sig)}"

puts "Successfully generated App Store Connect JWT token (Key ID: #{key_id})."

def api_get(path, token)
  uri = URI("https://api.appstoreconnect.apple.com#{path}")
  req = Net::HTTP::Get.new(uri)
  req['Authorization'] = "Bearer #{token}"
  req['Accept'] = 'application/json'

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  res = http.request(req)
  unless res.is_a?(Net::HTTPSuccess)
    warn "API Error #{res.code}: #{res.body}"
    return nil
  end
  JSON.parse(res.body)
end

# 2. Fetch Profiles
puts "Fetching provisioning profiles for bundle ID: #{bundle_id}..."
profiles_resp = api_get("/v1/profiles?include=bundleId&limit=100", token)

target_profile = nil

if profiles_resp && profiles_resp['data']
  bundle_id_map = {}
  (profiles_resp['included'] || []).each do |inc|
    if inc['type'] == 'bundleIds'
      bundle_id_map[inc['id']] = inc.dig('attributes', 'identifier')
    end
  end

  profiles_resp['data'].each do |prof|
    attrs = prof['attributes'] || {}
    state = attrs['profileState']
    ptype = attrs['profileType']
    p_bundle_ref = prof.dig('relationships', 'bundleId', 'data', 'id')
    matched_id = bundle_id_map[p_bundle_ref]

    puts "Found profile: '#{attrs['name']}' (Type: #{ptype}, UUID: #{attrs['uuid']}, State: #{state}, BundleID: #{matched_id})"
    if state == 'ACTIVE' && (matched_id == bundle_id || attrs['name']&.include?(bundle_id) || attrs['name']&.include?('BotConnector'))
      target_profile = prof
      break if ptype == 'IOS_APP_STORE'
    end
  end
end

if target_profile.nil? && profiles_resp && profiles_resp['data']
  target_profile = profiles_resp['data'].find { |p| p.dig('attributes', 'profileState') == 'ACTIVE' }
end

if target_profile.nil?
  warn "No active IOS_APP_STORE profile found via API! Listing all profiles..."
  all_resp = api_get('/v1/profiles?limit=50', token)
  all_resp['data']&.each do |p|
    warn "- #{p.dig('attributes', 'name')} (#{p.dig('attributes', 'profileType')}, #{p.dig('attributes', 'profileState')})"
  end
  exit 1
end

uuid = target_profile.dig('attributes', 'uuid')
name = target_profile.dig('attributes', 'name')
content_b64 = target_profile.dig('attributes', 'profileContent')

puts "Selected profile: '#{name}' (UUID: #{uuid})"

# 3. Install profile
profiles_dir = File.expand_path('~/Library/MobileDevice/Provisioning Profiles')
FileUtils.mkdir_p(profiles_dir)

profile_path = File.join(profiles_dir, "#{uuid}.mobileprovision")
File.write(profile_path, Base64.decode64(content_b64))

puts "Installed provisioning profile to: #{profile_path}"

# 4. Export environment variables
if ENV['GITHUB_ENV']
  File.open(ENV['GITHUB_ENV'], 'a') do |f|
    f.puts "PROVISIONING_PROFILE_SPECIFIER=#{name}"
    f.puts "PROVISIONING_PROFILE_UUID=#{uuid}"
  end
end

if ENV['GITHUB_OUTPUT']
  File.open(ENV['GITHUB_OUTPUT'], 'a') do |f|
    f.puts "profile_name=#{name}"
    f.puts "profile_uuid=#{uuid}"
  end
end

# 5. Point the app target's Release configuration at the profile (Expo prebuild project; Pods stay untouched)
require 'xcodeproj'
proj_path = Dir[File.expand_path('../../ios/*.xcodeproj', __dir__)].reject { |p| p.end_with?('Pods.xcodeproj') }.first
abort 'No ios/*.xcodeproj found - run expo prebuild first' unless proj_path
proj = Xcodeproj::Project.open(proj_path)
target = proj.targets.find { |t| t.product_type == 'com.apple.product-type.application' }
target.build_configurations.select { |c| c.name == 'Release' }.each do |c|
  c.build_settings['CODE_SIGN_STYLE'] = 'Manual'
  c.build_settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  c.build_settings['DEVELOPMENT_TEAM'] = ENV['TEAM_ID'] || '7DD999P944'
  c.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = name
end
proj.save
puts "Signing configured for target #{target.name} in #{File.basename(proj_path)}"
