fn main() {
    // Detectar se estamos compilando para BPF/SBF
    if std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default() == "bpf" {
        println!("cargo:rustc-cfg=getrandom_backend=\"custom\"");
    }
}