
public static partial class Program
{
    public const string CompilerHelperFullName = "HKTool.Runtime.CompilerHelper";
    private class AssemblyResolver : IAssemblyResolver
    {
        public AssemblyResolver(string[] assemblys, string ignore)
        {
            foreach (var v in assemblys)
            {
                try
                {
                    if (v == ignore) continue;
                    var bytes = File.ReadAllBytes(v);
                    var ass = AssemblyDefinition.ReadAssembly(new MemoryStream(bytes), new ReaderParameters()
                    {
                        AssemblyResolver = new AssemblyResolver()
                    });
                    assemblyMap.Add(ass.Name.Name, ass);
                    Console.Error.WriteLine(ass.FullName);
                    var pdb = Path.ChangeExtension(v, "pdb");
                    Program.assemblys[ass.Name.Name] = Assembly.Load(bytes, File.Exists(pdb) ? File.ReadAllBytes(pdb) : null);
                }
                catch (Exception)
                {

                }
            }
        }
        public AssemblyResolver()
        {

        }
        public static Dictionary<string, AssemblyDefinition> assemblyMap = new();
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
    private static bool inlineHook = false;
    private static bool onlyFixDep = false;
    private static bool setAllPublic = false;
    static void Main(string[] args)
    {
        inlineHook = args[0] == "1";
        onlyFixDep = args[0] == "2";
        setAllPublic = args[0] == "3";
        var files = args.Skip(1).ToArray();
        AppDomain.CurrentDomain.AssemblyResolve += (sender, ev) => {
            var name = new AssemblyName(ev.Name);
            if(assemblys.TryGetValue(name.Name, out var asm)) return asm;
            return null;
        };
        if (setAllPublic)
        {
            Console.Error.WriteLine(files[0]);
            using (var s = File.Open(files[0], FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            using (var ad = AssemblyDefinition.ReadAssembly(s))
            {
                ILModifyAssembly(ad);
                ad.Write();
            }
            return;
        }
        if (!onlyFixDep)
        {
            using (var ar = new AssemblyResolver(files, files[0]))
            {
                var origAssembly = Assembly.Load(File.ReadAllBytes(files[0]));
                assemblys.Add(origAssembly.GetName().Name, origAssembly);
                using (var s = File.Open(files[0], FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
                using (var ad = AssemblyDefinition.ReadAssembly(s, new ReaderParameters()
                {
                    AssemblyResolver = ar,
                    SymbolReaderProvider = new DefaultSymbolReaderProvider(true)
                }))
                {
                    AssemblyResolver.assemblyMap.Add(ad.Name.Name, ad);
                    ILModifyAssembly(ad);
                    ad.Write(new WriterParameters()
                    {
                        SymbolWriterProvider = new DefaultSymbolWriterProvider()
                    });
                }

            }
        }
        else
        {
            using (var s = File.Open(files[0], FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            using (var ad = AssemblyDefinition.ReadAssembly(s))
            {

                ILModifyAssembly(ad);
                ad.Write();
            }
        }
    }
    public static void ILModifyType(TypeDefinition type)
    {
        if (!setAllPublic)
        {
            CheckCP(type, type.CustomAttributes);
            foreach (var v in type.Methods.ToArray()) ILModify(v);
            foreach (var v in type.NestedTypes.Where(x => !IsNoModify(x.CustomAttributes)).ToArray()) ILModifyType(v);

            foreach (var v in type.Fields.Where(x => !IsNoModify(x.CustomAttributes)).ToArray())
            {
                v.FieldType = type.Module.ImportReference(ConvertHookDelegate(v.FieldType, type.Module, out _));
                CheckCP(v, v.CustomAttributes);
                foreach (var a in v.CustomAttributes.ToArray()) CheckCUP(a.AttributeType, null, null, (v, a));
            }
            foreach (var v in type.Properties.Where(x => !IsNoModify(x.CustomAttributes)).ToArray())
            {
                CheckCP(v, v.CustomAttributes);
                foreach (var a in v.CustomAttributes.ToArray()) CheckCUP(a.AttributeType, null, null, (v, a));
            }
        }
        else
        {
            type.IsPublic = true;
            foreach (var v in type.Methods)
            {
                v.IsPublic = true;
            }
            foreach (var v in type.Fields)
            {
                v.IsPublic = true;
            }
            foreach (var v in type.NestedTypes) ILModifyType(v);
        }
    }

    public static bool IsNoModify(IEnumerable<CustomAttribute> attr) => attr.Any(x => x.AttributeType.FullName == "HKTool.Attributes.NoModifyAttribute");
    public static void ILModify(MethodDefinition method)
    {
        CheckCP(method, method.CustomAttributes);
        if (IsNoModify(method.CustomAttributes)) return;
        foreach (var a in method.CustomAttributes.ToArray()) CheckCUP(a.AttributeType, method, null, a);
        foreach (var v in method.Parameters.ToArray())
        {
            v.ParameterType = method.Module.ImportReference(ConvertHookDelegate(v.ParameterType, method.Module, out _));
            foreach (var a in v.CustomAttributes.ToArray()) CheckCUP(a.AttributeType, method, null, (v, a));
        }
        if (!method.HasBody) return;
        if (method.Body.Instructions.Count == 0) return;

        var i = method.Body.Instructions[0];
        var p = method.Body.GetILProcessor();
        var next = i;
        while ((i = next) is not null)
        {
            next = i.Next;
            if (i.Operand is MemberReference mr)
            {
                CheckCUP(mr, method, i, null);
            }
            TryCheckIH(i, method);
        }
    }
    public static void ILModifyAssembly(AssemblyDefinition ass)
    {
        foreach (var m in ass.Modules)
        {
            if (setAllPublic)
            {
                foreach (var v in m.Types) ILModifyType(v);
            }
            if (!onlyFixDep)
            {
                foreach (var v in m.Types.ToArray().Where(x => !IsNoModify(x.CustomAttributes))) ILModifyType(v);
            }
            //throw null;
            var mscorlib = m.AssemblyReferences.FirstOrDefault(x => x.Name == "mscorlib") ?? new("mscorlib", new Version(4, 0, 0, 0));
            for (int i = 0; i < m.AssemblyReferences.Count; i++)
            {
                var a = m.AssemblyReferences[i];
                if (a.Name.StartsWith("MMHOOK_") && inlineHook)
                {
                    m.AssemblyReferences.RemoveAt(i);
                    i--;
                }
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


    public static TypeDefinition FindType(string name, ModuleDefinition md)
    {
        if (md is not null)
        {
            foreach (var v in md.Types)
            {
                if (v.FullName == name) return v;
            }
        }
        foreach (var v in AssemblyResolver.assemblyMap.Values)
        {
            var t = v.MainModule.Types.FirstOrDefault(x => x.FullName == name);
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
}
