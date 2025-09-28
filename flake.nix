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
            npmDepsHash = "sha256-SXkouJDyiviahRON+h3b3CotNB7xM1cWaB7Y0vPRNR8=";
          };
        };
      });
}