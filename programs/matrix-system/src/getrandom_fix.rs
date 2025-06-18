// Custom getrandom implementation for Solana
#[cfg(target_os = "solana")]
getrandom::register_custom_getrandom!(custom_getrandom);

#[cfg(target_os = "solana")]
fn custom_getrandom(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}

// Fix for older getrandom versions
#[cfg(target_os = "solana")]
#[no_mangle]
pub fn __getrandom_custom(_dest: *mut u8, _len: usize) -> u32 {
    // Return error code for unsupported
    1
}