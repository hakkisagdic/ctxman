class Ctxman < Formula
  desc "Universal LLM context manager with method-level filtering and TOON format"
  homepage "https://github.com/hakkisagdic/ctxman"
  url "https://registry.npmjs.org/ctxman/-/ctxman-3.0.0.tgz"
  sha256 "PLACEHOLDER_SHA256_HASH"
  license "MIT"
  version "2.3.5"

  depends_on "node"

  def install
    # Install npm package
    system "npm", "install", "-g", "--prefix=#{prefix}", "ctxman@#{version}"

    # Create symlink for binary
    bin.install_symlink Dir["#{prefix}/lib/node_modules/ctxman/bin/*"]

    # Create config directory
    (var/"ctxman").mkpath
    (var/"ctxman/logs").mkpath

    # Copy default config
    config_dir = "#{Dir.home}/.ctxman"
    FileUtils.mkdir_p(config_dir)

    unless File.exist?("#{config_dir}/config.json")
      config = {
        version: "2.3.5",
        updateChannel: "stable",
        autoUpdate: false,
        logLevel: "info",
        telemetry: false,
        outputFormat: "toon",
        installedAt: Time.now.utc.iso8601
      }

      File.write("#{config_dir}/config.json", JSON.pretty_generate(config))
    end
  end

  def post_install
    # Display installation success message
    ohai "Ctxman installed successfully!"
    puts ""
    puts "🚀 Quick Start:"
    puts "  ctxman --help              # Show help"
    puts "  ctxman --wizard            # Interactive wizard"
    puts "  ctxman --dashboard         # Live dashboard"
    puts ""
    puts "📚 Documentation:"
    puts "  https://github.com/hakkisagdic/ctxman"
    puts ""
    puts "⚙️  Configuration:"
    puts "  Directory: #{Dir.home}/.ctxman"
    puts "  Logs: #{Dir.home}/.ctxman/logs"
    puts ""
  end

  test do
    # Test installation
    system "#{bin}/ctxman", "--help"
    assert_match "Ctxman", shell_output("#{bin}/ctxman --help")

    # Test version
    system "#{bin}/ctxman", "--version"
  end

  def caveats
    <<~EOS
      Ctxman has been installed!

      Interactive features (wizard, dashboard) require additional dependencies:
        npm install -g ink react ink-select-input ink-text-input ink-spinner

      Configuration directory:
        #{Dir.home}/.ctxman

      To get started:
        ctxman --help
        ctxman --wizard

      For updates:
        brew upgrade ctxman
        # Or use built-in updater:
        ctxman update check

      Documentation:
        https://github.com/hakkisagdic/ctxman
    EOS
  end
end
