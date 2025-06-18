// Implementação customizada do getrandom para BPF
use core::num::NonZeroU32;

// Para getrandom 0.1.x (usado pelo chainlink)
#[no_mangle]
pub unsafe extern "C" fn __getrandom_custom(dest: *mut u8, len: usize) -> u32 {
    // Retornar erro (1 = erro para getrandom 0.1)
    1
}

// Para getrandom 0.2.x (usado por outras deps)
#[no_mangle]
pub unsafe extern "C" fn getrandom(dest: *mut u8, len: usize, flags: u32) -> isize {
    // Retornar -1 para indicar erro
    -1
}

// Estrutura de erro para getrandom 0.2/0.3
#[repr(C)]
pub struct Error(NonZeroU32);

// Para getrandom 0.2.x com nova API
#[no_mangle]
pub unsafe extern "C" fn __getrandom_v02_custom(
    dest: *mut u8,
    len: usize,
) -> Result<(), Error> {
    Err(Error(NonZeroU32::new(1).unwrap()))
}

// Para getrandom 0.3.x
#[no_mangle]
pub unsafe extern "Rust" fn __getrandom_v03_custom(
    dest: *mut u8,
    len: usize,
) -> Result<(), Error> {
    Err(Error(NonZeroU32::new(1).unwrap()))
}