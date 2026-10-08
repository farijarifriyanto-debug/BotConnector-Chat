# frozen_string_literal: true
# READ ONLY. Prints what is already filled in on the App Store record, without any value that could be private
# (the repo is public, so workflow logs are public: lengths and yes/no only, never review contacts or demo logins).
require_relative 'asc'

bundle = ENV['BUNDLE_ID'] || 'id.botconnector.app'
yn = ->(v) { v.to_s.strip.empty? ? 'empty' : "filled(#{v.to_s.length})" }

app = ASC.list("/v1/apps?filter[bundleId]=#{bundle}").first or abort 'app not found for this API key'
puts "app: #{app['attributes']['name']} | primaryLocale=#{app['attributes']['primaryLocale']} | id ok"

puts "\n== builds (latest 6)"
ASC.list("/v1/builds?filter[app]=#{app['id']}&sort=-uploadedDate&limit=6").each { |b| a = b['attributes']; puts "  build #{a['version']} processing=#{a['processingState']} expired=#{a['expired']}" }

puts "\n== versions"
versions = ASC.list("/v1/apps/#{app['id']}/appStoreVersions?limit=10")
versions.each { |v| a = v['attributes']; puts "  #{a['platform']} #{a['versionString']} state=#{a['appStoreState']} release=#{a['releaseType']}" }
ver = versions.find { |v| %w[PREPARE_FOR_SUBMISSION DEVELOPER_REJECTED REJECTED METADATA_REJECTED].include?(v['attributes']['appStoreState']) }
puts ver ? "\neditable version: #{ver['attributes']['versionString']} (#{ver['attributes']['appStoreState']})" : "\nno editable version yet (create 2.0.0 in App Store Connect, or ask me to create it)"

if ver
  vid = ver['id']
  b = ASC.list("/v1/appStoreVersions/#{vid}/build")
  puts "selected build: #{b.empty? ? 'none' : 'attached'}"
  puts "\n== version localizations"
  ASC.list("/v1/appStoreVersions/#{vid}/appStoreVersionLocalizations").each do |l|
    a = l['attributes']
    puts "  #{a['locale']}: description=#{yn.(a['description'])} keywords=#{yn.(a['keywords'])} whatsNew=#{yn.(a['whatsNew'])} promo=#{yn.(a['promotionalText'])} support=#{yn.(a['supportUrl'])} marketing=#{yn.(a['marketingUrl'])}"
    ASC.list("/v1/appStoreVersionLocalizations/#{l['id']}/appScreenshotSets").each do |s|
      n = ASC.list("/v1/appScreenshotSets/#{s['id']}/appScreenshots").size
      puts "     screenshots #{s['attributes']['screenshotDisplayType']}: #{n}"
    end
  end
  puts "\n== review detail (yes/no only)"
  rd = ASC.list("/v1/appStoreVersions/#{vid}/appStoreReviewDetail")
  r = rd.is_a?(Array) ? rd.first : rd
  if r
    a = r['attributes']
    puts "  contact name=#{yn.(a['contactFirstName'])} phone=#{yn.(a['contactPhone'])} email=#{yn.(a['contactEmail'])} demoRequired=#{a['demoAccountRequired']} demoUser=#{yn.(a['demoAccountName'])} notes=#{yn.(a['notes'])}"
  else
    puts '  none yet'
  end
end

puts "\n== app info"
ASC.list("/v1/apps/#{app['id']}/appInfos").each do |i|
  puts "  appInfo state=#{i['attributes']['appStoreState']}"
  ASC.list("/v1/appInfos/#{i['id']}/appInfoLocalizations").each { |l| a = l['attributes']; puts "   #{a['locale']}: name=#{yn.(a['name'])} subtitle=#{yn.(a['subtitle'])} privacyUrl=#{yn.(a['privacyPolicyUrl'])}" }
  pc = ASC.get("/v1/appInfos/#{i['id']}/primaryCategory")[1].dig('data', 'id')
  sc = ASC.get("/v1/appInfos/#{i['id']}/secondaryCategory")[1].dig('data', 'id')
  puts "   categories primary=#{pc || 'none'} secondary=#{sc || 'none'}"
  ar = ASC.get("/v1/appInfos/#{i['id']}/ageRatingDeclaration")[1].dig('data')
  puts "   ageRating declaration: #{ar ? 'present' : 'none'}"
end
puts "\n(App Privacy answers are not readable through the API: check them in the App Store Connect page.)"
