// Custom getrandom implementation for Solana v0.3
#[cfg(target_os = "solana")]
use getrandom::Error;

// Esta é a função correta para v0.3 com backend custom
#[cfg(target_os = "solana")]
#[no_mangle]
unsafe extern "Rust" fn __getrandom_v03_custom(
    dest: *mut u8,
    len: usize,
) -> Result<(), Error> {
    Err(Error::UNSUPPORTED)
}