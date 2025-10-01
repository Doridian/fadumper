{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages = {
          default = pkgs.buildNpmPackage {
            pname = "fadumper";
            version = "1.0.0";
            src = ./.;
            npmDepsHash = "sha256-rdg9jc8l6pvdYtX6WpFkku/CQKLEmTPzCieR+Rjwi5Y=";
          };
        };
      });
}
