# frozen_string_literal: true
# Tiny App Store Connect API client (JWT ES256). Used by the inspect/fill workflows; never prints the key.
require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'

module ASC
  BASE = 'https://api.appstoreconnect.apple.com'
  def self.b64url(d) = Base64.urlsafe_encode64(d, padding: false)

  def self.token
    key_id = ENV.fetch('APP_STORE_CONNECT_API_KEY_ID')
    issuer = ENV.fetch('APP_STORE_CONNECT_API_ISSUER_ID')
    path = ENV['KEY_PATH'] || File.expand_path("~/.appstoreconnect/private_keys/AuthKey_#{key_id}.p8")
    input = "#{b64url({ alg: 'ES256', kid: key_id, typ: 'JWT' }.to_json)}.#{b64url({ iss: issuer, exp: Time.now.to_i + 1200, aud: 'appstoreconnect-v1' }.to_json)}"
    asn1 = OpenSSL::ASN1.decode(OpenSSL::PKey::EC.new(File.read(path)).sign('SHA256', input))
    raw = asn1.value.map { |v| v.value.to_s(2).rjust(32, "\x00")[-32..] }.join
    "#{input}.#{b64url(raw)}"
  end

  def self.request(method, path, body = nil)
    uri = URI(path.start_with?('http') ? path : BASE + path)
    req = { 'GET' => Net::HTTP::Get, 'POST' => Net::HTTP::Post, 'PATCH' => Net::HTTP::Patch, 'DELETE' => Net::HTTP::Delete }[method].new(uri)
    req['Authorization'] = "Bearer #{@tok ||= token}"
    req['Content-Type'] = 'application/json'
    req.body = body.to_json if body
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |h| h.request(req) }
    json = res.body.to_s.empty? ? {} : (JSON.parse(res.body) rescue { 'raw' => res.body[0, 200] })
    [res.code.to_i, json]
  end
  def self.get(path) = request('GET', path)
  # a GET that returns just the data array (or nil with the error code printed)
  def self.list(path)
    code, j = get(path)
    return [] if code == 404
    abort "GET #{path.split('?').first} -> #{code} #{(j['errors'] || []).map { |e| e['code'] }.join(',')}" unless code == 200
    j['data'] || []
  end
end
