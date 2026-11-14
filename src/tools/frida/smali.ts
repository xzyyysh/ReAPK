import * as vscode from "vscode";

export interface SmaliMethod {
  className: string;
  methodName: string;
  paramTypes: string[];
  returnType: string;
  isStatic: boolean;
  isConstructor: boolean;
}

export function smaliTypeToJava(smaliType: string): string {
  if (smaliType.startsWith("[")) {
    return smaliType;
  }
  switch (smaliType) {
    case "V":
      return "void";
    case "Z":
      return "boolean";
    case "B":
      return "byte";
    case "S":
      return "short";
    case "C":
      return "char";
    case "I":
      return "int";
    case "J":
      return "long";
    case "F":
      return "float";
    case "D":
      return "double";
    default:
      if (smaliType.startsWith("L") && smaliType.endsWith(";")) {
        return smaliType.slice(1, -1).replace(/\//g, ".");
      }
      return smaliType;
  }
}

export function parseSmaliParams(paramStr: string): string[] {
  const params: string[] = [];
  let i = 0;
  while (i < paramStr.length) {
    let arrayPrefix = "";
    while (i < paramStr.length && paramStr[i] === "[") {
      arrayPrefix += "[";
      i++;
    }
    if (i >= paramStr.length) break;
    if (paramStr[i] === "L") {
      const semi = paramStr.indexOf(";", i);
      if (semi === -1) break;
      params.push(arrayPrefix + paramStr.slice(i, semi + 1));
      i = semi + 1;
    } else {
      params.push(arrayPrefix + paramStr[i]);
      i++;
    }
  }
  return params;
}

export function parseMethodFromLine(
  line: string,
  className: string,
): SmaliMethod | null {
  const match = line.match(
    /\.method\s+(?:(?:public|private|protected|static|final|synthetic|bridge|varargs|declared-synchronized|abstract|native|strictfp|constructor)\s+)*(\S+)\(([^)]*)\)(\S+)/,
  );
  if (!match) return null;
  const methodName = match[1];
  const paramStr = match[2];
  const returnType = match[3];
  const isStatic = /\bstatic\b/.test(line);
  const isConstructor = methodName === "<init>" || methodName === "<clinit>";
  return {
    className: smaliTypeToJava("L" + className + ";"),
    methodName,
    paramTypes: parseSmaliParams(paramStr),
    returnType,
    isStatic,
    isConstructor,
  };
}

export function getClassNameFromDocument(
  document: vscode.TextDocument,
): string {
  const text = document.getText();
  const match = text.match(/\.class\s+[^L]*L([^;]+);/);
  return match ? match[1] : "unknown/Class";
}
