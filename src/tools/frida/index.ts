import { generateHook as generateHookImpl } from "./hooks";
import { injectGadget as injectGadgetImpl } from "./gadget";
import {
  smaliTypeToJava,
  parseSmaliParams,
  parseMethodFromLine,
} from "./smali";
import { generateFridaHook } from "./hooks";
import {
  detectArch,
  detectArchFromFilename,
  findSmaliFile,
  patchSmaliWithGadgetLoad,
  generateGadgetName,
  GADGET_INJECT_MARKER,
} from "./gadget";

export namespace frida {
  export const generateHook = generateHookImpl;
  export const injectGadget = injectGadgetImpl;
}

export const _testing = {
  smaliTypeToJava,
  parseSmaliParams,
  parseMethodFromLine,
  generateFridaHook,
  detectArch,
  detectArchFromFilename,
  findSmaliFile,
  patchSmaliWithGadgetLoad,
  generateGadgetName,
  GADGET_INJECT_MARKER,
};
