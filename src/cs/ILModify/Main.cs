
public static class Program
{
    private class AssemblyResolver : IAssemblyResolver
    {
        public AssemblyResolver(string[] assemblys, string ignore)
        {
            foreach (var v in assemblys)
            {
                if (v == ignore) continue;
                var ass = AssemblyDefinition.ReadAssembly(new MemoryStream(File.ReadAllBytes(v)));
                assemblyMap.Add(ass.Name.Name, ass);
            }
        }
        public Dictionary<string, AssemblyDefinition> assemblyMap = new();
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name, ReaderParameters rp)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        void IDisposable.Dispose()
        {
            foreach (var v in assemblyMap.Values) v.Dispose();
        }
    }
    static void Main(string[] args)
    {
        using (var ar = new AssemblyResolver(args, args[0]))
        {
            using (var s = File.Open(args[0], FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            using (var ad = AssemblyDefinition.ReadAssembly(s, new ReaderParameters()
            {
                AssemblyResolver = ar,
                SymbolReaderProvider = new DefaultSymbolReaderProvider(true)
            }))
            {
                Console.WriteLine($"Pdb Type: {ad.MainModule.SymbolReader.GetType().FullName}");
                ILModifyAssembly(ad);
                ad.Write(new WriterParameters()
                {
                    SymbolWriterProvider = new DefaultSymbolWriterProvider()
                });
            }
        }
    }
    public static void ILModifyType(TypeDefinition type)
    {
        foreach (var v in type.Methods) ILModify(v);
        foreach (var v in type.NestedTypes) ILModifyType(v);
    }
    public static void ILModify(MethodDefinition method)
    {
        if (!method.HasBody) return;
        if (method.Body.Instructions.Count == 0) return;

        var i = method.Body.Instructions[0];
        var next = i;
        while ((i = next) is not null)
        {
            next = i.Next;
            if (i.OpCode == OpCodes.Call)
            {
                var m = (MethodReference)i.Operand;
                if (m.DeclaringType.FullName == "HKTool.Utils.Compile.ReflectionHelperEx")
                {
                    IL_ReflectionHelperEx(m, method, i);
                }
            }

        }
    }
    public static void ILModifyAssembly(AssemblyDefinition ass)
    {
        foreach (var m in ass.Modules)
        {
            foreach (var v in m.Types) ILModifyType(v);
            var mscorlib = m.AssemblyReferences.FirstOrDefault(x => x.Name == "mscorlib");
            foreach (var a in m.AssemblyReferences)
            {
                if (a.Name == "System.Private.CoreLib")
                {
                    a.Name = mscorlib.Name;
                    a.Attributes = mscorlib.Attributes;
                    a.Hash = mscorlib.Hash;
                    a.PublicKey = mscorlib.PublicKey;
                    a.PublicKeyToken = mscorlib.PublicKeyToken;
                    a.Version = mscorlib.Version;
                    a.Culture = mscorlib.Culture;
                }
            }
        }
    }

    public static MethodBase GetMethodFromHandle = typeof(MethodBase)
        .GetMethod("GetMethodFromHandle", new Type[] { typeof(RuntimeMethodHandle) });
    public static MethodBase GetFieldFromHandle = typeof(FieldInfo)
        .GetMethod("GetFieldFromHandle", new Type[] { typeof(RuntimeFieldHandle) });
    public static MethodBase GetTypeFromHandle = typeof(Type)
        .GetMethod("GetTypeFromHandle", new Type[] { typeof(RuntimeTypeHandle) });
    public static TypeDefinition FindType(string name, ModuleDefinition md)
    {
        foreach (var v in md.Types)
        {
            if (v.FullName == name) return v;
        }
        foreach (var v in md.AssemblyReferences)
        {
            var t = md.AssemblyResolver.Resolve(v)
            .MainModule.Types.FirstOrDefault(x => x.FullName == name);
            if (t != null) return t;
        }
        return null;
    }
    public static TypeDefinition FindTypeEx(string name, ModuleDefinition md)
    {
        var parts = name.Split('+');
        var parent = FindType(parts[0], md);
        if (parent == null) return null;
        for (int a = 1; a < parts.Length; a++)
        {
            var n = parts[a];
            var t = parent.NestedTypes.FirstOrDefault(x => x.Name == n);
            if (t == null) return null;
            parent = t;
        }
        return parent;
    }
    public static void IL_ReflectionHelperEx(MethodReference mr, MethodDefinition md, Instruction i)
    {
        if (mr.Name == "GetSelf")
        {
            i.OpCode = OpCodes.Ldarg_0;
            i.Operand = null;
            return;
        }
        var lastLdstr = i.Previous;
        if (lastLdstr.OpCode != OpCodes.Ldstr) return;
        var s = (string)lastLdstr.Operand;
        if (mr.Name == "GetFieldSelf")
        {
            var field = md.DeclaringType.Fields.FirstOrDefault(x => x.Name == s);
            lastLdstr.OpCode = OpCodes.Ldtoken;
            lastLdstr.Operand = field;
            i.Operand = md.Module.ImportReference(
                GetFieldFromHandle
                );
        }
        else if (mr.Name == "GetMethodSelf")
        {
            var method2 = md.DeclaringType.Methods.FirstOrDefault(x => x.Name == s);
            lastLdstr.OpCode = OpCodes.Ldtoken;
            lastLdstr.Operand = method2;
            i.Operand = md.Module.ImportReference(
                GetMethodFromHandle
                );
        }
        else if (mr.Name == "FindType")
        {
            var parent = FindTypeEx(s, md.Module);
            if (parent == null) return;
            lastLdstr.OpCode = OpCodes.Ldtoken;
            lastLdstr.Operand = md.Module.ImportReference(parent);
            i.Operand = md.Module.ImportReference(
                GetTypeFromHandle
                );
        }
        else if (mr.Name == "FindFieldInfo")
        {
            var tn = s.Substring(0, s.IndexOf(':'));
            var fn = s.Substring(s.LastIndexOf(':') + 1);
            var type = FindTypeEx(tn, md.Module);
            if (type == null) return;
            var field = type.Fields.FirstOrDefault(x => x.Name == fn);
            if (field == null) return;
            lastLdstr.OpCode = OpCodes.Ldtoken;
            lastLdstr.Operand = md.Module.ImportReference(field);
            i.Operand = md.Module.ImportReference(
                GetFieldFromHandle
                );
        }
        else if (mr.Name == "FindMethodBase")
        {
            var tn = s.Substring(0, s.IndexOf(':'));
            var fn = s.Substring(s.LastIndexOf(':') + 1);
            var type = FindTypeEx(tn, md.Module);
            if (type == null) return;
            var method = type.Methods.FirstOrDefault(x => x.Name == fn);
            if (method == null) return;
            lastLdstr.OpCode = OpCodes.Ldtoken;
            lastLdstr.Operand = md.Module.ImportReference(method);
            i.Operand = md.Module.ImportReference(
                GetMethodFromHandle
                );
        }
    }
}
