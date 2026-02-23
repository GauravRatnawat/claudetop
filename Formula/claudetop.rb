class Claudetop < Formula
  desc "Interactive terminal dashboard for Claude Code token usage and cost tracking"
  homepage "https://gauravratnawat.github.io/claudetop/"
  url "https://registry.npmjs.org/claudetop/-/claudetop-1.0.0.tgz"
  sha256 "645562936f63ad33f1c18ab5e79dd113eb94c0ae22281cc57ba9996cac62b686"
  license "MIT"
  version "1.0.0"

  depends_on "node"

  def install
    # Install npm dependencies
    system "npm", "install", "--production", "--ignore-scripts"

    # Install all files
    libexec.install Dir["*"]

    # Create wrapper script so `claudetop` works from PATH
    (bin/"claudetop").write <<~EOS
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/src/index.js" "$@"
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/claudetop --version")
    assert_match "claudetop", shell_output("#{bin}/claudetop --help")
  end
end
