// Custom getrandom APENAS para compilação BPF/SBF
#[cfg(all(
    target_arch = "bpf",
    not(feature = "no-entrypoint")
))]
getrandom::register_custom_getrandom!(custom_getrandom);

#[cfg(all(
    target_arch = "bpf",
    not(feature = "no-entrypoint")
))]
fn custom_getrandom(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}

// Para getrandom 0.1.x
#[cfg(all(
    target_arch = "bpf",
    not(feature = "no-entrypoint")
))]
#[no_mangle]
pub unsafe extern "C" fn __getrandom_custom(_dest: *mut u8, _len: usize) -> u32 {
    1
}

// Para getrandom 0.2.x  
#[cfg(all(
    target_arch = "bpf",
    not(feature = "no-entrypoint")
))]
#[no_mangle]
pub unsafe extern "C" fn __getrandom_v02_custom(
    _dest: *mut u8,
    _len: usize,
) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}